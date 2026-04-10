import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { cancelResearch } from "./handlers/cancel-research";
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
import { getMe, updateMe } from "./handlers/users";
import { authMiddleware, verifyClerkJWT } from "./lib/auth";
import { getDb } from "./lib/db";
import { executeResearch } from "./lib/research";
import type { Env, ResearchJobMessage } from "./types";

export { UserSync } from "./durable-objects/UserSync";

const app = new Hono<Env>();

// CORS
const ALLOWED_ORIGINS =
  /^https:\/\/(www\.)?nylonimpossible\.com$|^https:\/\/(?:api-)?pr-\d+\.nylonimpossible\.com$/;
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
    return c.json({ error: "Expected WebSocket upgrade" }, 400);
  }

  const token = c.req.query("token");
  const auth = await verifyClerkJWT(token ? `Bearer ${token}` : null, c.env);

  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
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

// Todo routes
app.post("/todos/smart", smartCreate);
app.post("/todos/sync", syncTodos);
app.get("/todos", listTodos);
app.post("/todos", createTodo);
app.get("/todos/:id", getTodo);
app.put("/todos/:id", updateTodo);
app.delete("/todos/:id", deleteTodo);
app.post("/todos/:id/research", reresearchTodo);
app.delete("/todos/:id/research", cancelResearch);

// User routes
app.get("/users/me", getMe);
app.patch("/users/me", updateMe);

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
