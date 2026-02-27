import { Hono } from "hono";
import { cors } from "hono/cors";
import { syncTodos } from "./handlers/sync";
import {
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
} from "./handlers/todos";
import { authMiddleware, verifyClerkJWT } from "./lib/auth";
import type { Env } from "./types";

export { UserSync } from "./durable-objects/UserSync";

const app = new Hono<Env>();

// CORS
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

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

// Todo routes
app.post("/todos/sync", syncTodos);
app.get("/todos", listTodos);
app.post("/todos", createTodo);
app.put("/todos/:id", updateTodo);
app.delete("/todos/:id", deleteTodo);

export default app;
