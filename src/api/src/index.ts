import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import {
  deleteUserAsAdmin,
  getUser,
  listUsers,
  updateUser,
} from "./handlers/admin";
import {
  agentAddSubtask,
  agentCompleteTodo,
  agentUpdateTodo,
  internalAgentAuthMiddleware,
} from "./handlers/agent-internal";
import { acceptSuggestion } from "./handlers/apply-suggestion";
import { cancelResearch } from "./handlers/cancel-research";
import { dismissQuestion } from "./handlers/dismiss-question";
import { dismissSuggestion } from "./handlers/dismiss-suggestion";
import { enrichTodo } from "./handlers/enrich";
import {
  gmailAddonAddFromMessage,
  gmailAddonQuickAdd,
  gmailAddonRefresh,
  gmailAddonToggle,
} from "./handlers/gmail-addon/actions";
import { gmailAddonContextual } from "./handlers/gmail-addon/contextual";
import { gmailAddonHomepage } from "./handlers/gmail-addon/homepage";
import { importGoogleTasks } from "./handlers/import-google-tasks";
import {
  createList,
  deleteList,
  getList,
  getLists,
  updateList,
} from "./handlers/lists";
import { replyToTodo } from "./handlers/reply";
import { reresearchTodo } from "./handlers/reresearch";
import { smartCreate } from "./handlers/smart-create";
import { syncTodos } from "./handlers/sync";
import { readAgentMessages, sendAgentMessage } from "./handlers/todo-agent";
import {
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "./handlers/todos";
import { deleteMe, getMe, updateMe } from "./handlers/users";
import { clerkWebhook } from "./handlers/webhooks";
import { verifyGoogleIdToken } from "./lib/addon-auth";
import { authMiddleware, requireAdmin, verifyClerkJWT } from "./lib/auth";
import { getDb } from "./lib/db";
import { apiError } from "./lib/errors";
import { runListSweep } from "./lib/list-sweep";
import { executeResearch } from "./lib/research";
import type { Env, ResearchJobMessage } from "./types";

export { UserSync } from "./durable-objects/UserSync";

const app = new Hono<Env>();

// CORS
const ALLOWED_ORIGINS =
  /^https:\/\/(www\.|admin\.)?nylonimpossible\.com$|^https:\/\/(?:api-)?pr-\d+\.nylonimpossible\.com$/;
const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Worker Previews serve the web app from a
// <preview>-<worker>.<subdomain>.workers.dev origin. Only trusted outside
// production (the preview API runs with ENVIRONMENT: "preview"), so prod CORS
// stays pinned to our own domains and never opens up to arbitrary *.workers.dev.
const WORKERS_DEV_ORIGIN =
  /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$/;

app.use("*", (c, next) => {
  const isDev = c.env.ENVIRONMENT !== "production";
  return cors({
    origin: (origin) => {
      if (isDev && LOCALHOST_ORIGIN.test(origin)) return origin;
      if (isDev && WORKERS_DEV_ORIGIN.test(origin)) return origin;
      return ALLOWED_ORIGINS.test(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next);
});

// Health check
app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => c.text("OK"));

// WebSocket upgrade — auth via query param
app.get("/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return apiError(c, "websocket_upgrade_required");
  }

  const token = c.req.query("token");
  const auth = await verifyClerkJWT(token ? `Bearer ${token}` : null, c.env);

  if (!auth) {
    return apiError(c, "unauthorized");
  }

  const id = c.env.USER_SYNC.idFromName(auth.userId);
  const stub = c.env.USER_SYNC.get(id);
  return stub.fetch(c.req.raw);
});

// Auth middleware for todo routes
app.use("/todos/*", authMiddleware);
app.use("/todos", authMiddleware);

// Auth middleware for list routes
app.use("/lists/*", authMiddleware);
app.use("/lists", authMiddleware);

// Auth middleware for user routes
app.use("/users/*", authMiddleware);

// Admin routes (auth + admin role required)
app.use("/admin/*", authMiddleware, requireAdmin);

// Clerk webhooks (Svix signature is the auth — NOT wrapped in authMiddleware)
app.post("/webhooks/clerk", clerkWebhook);

// Gmail add-on: Google-signed ID token is the auth (like the Clerk webhook,
// deliberately NOT wrapped in authMiddleware). Google's calls are
// server-to-server, so CORS/ALLOWED_ORIGINS doesn't apply.
app.use("/gmail-addon/*", verifyGoogleIdToken);
app.post("/gmail-addon/homepage", gmailAddonHomepage);
app.post("/gmail-addon/contextual", gmailAddonContextual);
app.post("/gmail-addon/actions/quick-add", gmailAddonQuickAdd);
app.post("/gmail-addon/actions/add-from-message", gmailAddonAddFromMessage);
app.post("/gmail-addon/actions/toggle", gmailAddonToggle);
app.post("/gmail-addon/actions/refresh", gmailAddonRefresh);

// Todo routes
app.post("/todos/smart", smartCreate);
app.post("/todos/import/google-tasks", importGoogleTasks);
app.post("/todos/sync", syncTodos);
app.get("/todos", listTodos);
app.post("/todos", createTodo);
app.get("/todos/:id", getTodo);
app.put("/todos/:id", updateTodo);
app.delete("/todos/:id", deleteTodo);
app.post("/todos/:id/research", reresearchTodo);
app.delete("/todos/:id/research", cancelResearch);
app.post("/todos/:id/enrich", enrichTodo);
app.post("/todos/:id/reply", replyToTodo);
app.delete("/todos/:id/question", dismissQuestion);
app.post("/todos/:id/suggestions/:sid/accept", acceptSuggestion);
app.post("/todos/:id/suggestions/:sid/dismiss", dismissSuggestion);
app.post("/todos/:id/agent/message", sendAgentMessage);
app.on(["GET", "HEAD"], "/todos/:id/agent/messages", readAgentMessages);
// Human-only confirm for the agent's propose-delete flow — the agent can
// never call this itself (no tool maps to it), only a human clicking
// confirm in the chat UI. Identical to DELETE /todos/:id under the hood
// (same ownership check, same cascade); a distinct URL only so the model
// has no path to it.
app.post("/todos/:id/agent/confirm-delete", deleteTodo);

// List routes
app.get("/lists", getLists);
app.post("/lists", createList);
app.get("/lists/:id", getList);
app.patch("/lists/:id", updateList);
app.delete("/lists/:id", deleteList);

// Internal routes for the todo-agent Worker's tools (bearer-secret auth,
// see handlers/agent-internal.ts for why this can't rely on "no route" alone).
app.use("/internal/agent/*", internalAgentAuthMiddleware);
app.post("/internal/agent/todos/:id/update", agentUpdateTodo);
app.post("/internal/agent/todos/:id/complete", agentCompleteTodo);
app.post("/internal/agent/todos/:id/subtasks", agentAddSubtask);

// User routes
app.get("/users/me", getMe);
app.patch("/users/me", updateMe);
app.delete("/users/me", deleteMe);

// Admin endpoints
app.get("/admin/users", listUsers);
app.get("/admin/users/:id", getUser);
app.patch("/admin/users/:id", updateUser);
app.delete("/admin/users/:id", deleteUserAsAdmin);

// Catch-all for unhandled throws in route handlers. Hono's default onError
// swallows these into a bare 500 that never reaches Sentry (withSentry only
// wraps the outer fetch handler), so route bugs stay invisible — capture them
// here and return the structured error envelope clients expect.
app.onError((err, c) => {
  // Intentional HTTP exceptions carry their own status/response — pass them
  // through untouched rather than reporting them as server errors.
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  Sentry.captureException(err, {
    tags: { area: "api", path: c.req.path, method: c.req.method },
  });
  return apiError(c, "internal_error");
});

const handler: ExportedHandler<Env["Bindings"], ResearchJobMessage> = {
  fetch: app.fetch,
  async scheduled(_event, env): Promise<void> {
    try {
      const db = getDb(env.DB);
      await runListSweep(db, env, new Date());
    } catch (error) {
      Sentry.captureException(error, {
        tags: { area: "cron-list-sweep" },
      });
    }
  },
  async queue(batch, env): Promise<void> {
    const db = getDb(env.DB);
    for (const message of batch.messages) {
      const job = message.body;
      try {
        await executeResearch(
          db,
          env.AI,
          env,
          job.todoId,
          job.userId,
          job.query,
          job.researchType,
          job.researchId,
          job.userLocation,
        );
      } catch (error) {
        Sentry.captureException(error, {
          tags: { area: "research-queue" },
          extra: { researchType: job.researchType },
        });
        throw error;
      }
      message.ack();
    }
  },
};

export default Sentry.withSentry<Env["Bindings"], ResearchJobMessage>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT ?? "production",
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Strip request body from events (may contain todo titles — PII)
      if (event.request?.data) delete event.request.data;
      return event;
    },
  }),
  handler,
);
