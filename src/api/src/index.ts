import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  deleteUserAsAdmin,
  getUser,
  listUsers,
  updateUser,
} from "./handlers/admin";
import { cancelResearch } from "./handlers/cancel-research";
import { dismissQuestion } from "./handlers/dismiss-question";
import { importGoogleTasks } from "./handlers/import-google-tasks";
import { replyToTodo } from "./handlers/reply";
import { reresearchTodo } from "./handlers/reresearch";
import { smartCreate } from "./handlers/smart-create";
import { syncTodos } from "./handlers/sync";
import {
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "./handlers/todos";
import { deleteMe, getMe, updateMe } from "./handlers/users";
import { clerkWebhook } from "./handlers/webhooks";
import { authMiddleware, requireAdmin, verifyClerkJWT } from "./lib/auth";
import { getDb } from "./lib/db";
import { apiError } from "./lib/errors";
import { executeResearch } from "./lib/research";
import type { Env, ResearchJobMessage } from "./types";

export { UserSync } from "./durable-objects/UserSync";

const app = new Hono<Env>();

// CORS
const ALLOWED_ORIGINS =
  /^https:\/\/(www\.|admin\.)?nylonimpossible\.com$|^https:\/\/(?:api-)?pr-\d+\.nylonimpossible\.com$/;
const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d+)?$/;

app.use("*", (c, next) => {
  const isDev = c.env.ENVIRONMENT !== "production";
  return cors({
    origin: (origin) => {
      if (isDev && LOCALHOST_ORIGIN.test(origin)) return origin;
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

// Auth middleware for user routes
app.use("/users/*", authMiddleware);

// Admin routes (auth + admin role required)
app.use("/admin/*", authMiddleware, requireAdmin);

// Clerk webhooks (Svix signature is the auth — NOT wrapped in authMiddleware)
app.post("/webhooks/clerk", clerkWebhook);

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
app.post("/todos/:id/reply", replyToTodo);
app.delete("/todos/:id/question", dismissQuestion);

// User routes
app.get("/users/me", getMe);
app.patch("/users/me", updateMe);
app.delete("/users/me", deleteMe);

// Admin endpoints
app.get("/admin/users", listUsers);
app.get("/admin/users/:id", getUser);
app.patch("/admin/users/:id", updateUser);
app.delete("/admin/users/:id", deleteUserAsAdmin);

const handler: ExportedHandler<Env["Bindings"], ResearchJobMessage> = {
  fetch: app.fetch,
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
