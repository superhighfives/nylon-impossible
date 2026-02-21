import { verifyClerkJWT } from "./lib/auth";
import { cors, unauthorized, notFound, error } from "./lib/response";
import { listTodos, createTodo, updateTodo, deleteTodo } from "./handlers/todos";
import { syncTodos } from "./handlers/sync";
import type { Env, AuthenticatedRequest } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return cors();
    }

    // Health check
    if (path === "/" || path === "/health") {
      return new Response("OK", { status: 200 });
    }

    // All other routes require auth
    const auth = await verifyClerkJWT(
      request.headers.get("Authorization"),
      env
    );

    if (!auth) {
      return unauthorized();
    }

    // Add userId to request
    const req = request as AuthenticatedRequest;
    req.userId = auth.userId;

    try {
      // Route matching
      // POST /todos/sync - must come before /todos/:id
      if (path === "/todos/sync" && method === "POST") {
        return syncTodos(req, env);
      }

      // GET /todos - list all
      if (path === "/todos" && method === "GET") {
        return listTodos(req, env);
      }

      // POST /todos - create
      if (path === "/todos" && method === "POST") {
        return createTodo(req, env);
      }

      // /todos/:id routes
      const todoMatch = path.match(/^\/todos\/([a-f0-9-]+)$/i);
      if (todoMatch) {
        const todoId = todoMatch[1];

        if (method === "PUT") {
          return updateTodo(req, env, todoId);
        }

        if (method === "DELETE") {
          return deleteTodo(req, env, todoId);
        }
      }

      return notFound("Route");
    } catch (err) {
      console.error("API error:", err);
      return error("Internal server error", 500);
    }
  },
};
