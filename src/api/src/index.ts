import { Hono } from "hono";
import { cors } from "hono/cors";
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
import type { Env } from "./types";

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

// User routes
app.get("/users/me", getMe);
app.patch("/users/me", updateMe);

export default app;
