import {
  loadUrlsByTodoId,
  serializeTodo,
  serializeUrl,
} from "@nylon-impossible/shared/serialize";
import type { Context } from "hono";
import { and, eq, getDb, todos, todoUrls } from "../lib/db";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

// GET /todos - List all todos for user
export async function listTodos(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const userTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.createdAt);

  const urlsByTodoId = await loadUrlsByTodoId(
    db,
    userTodos.map((t) => t.id),
  );

  return c.json(
    userTodos.map((todo) => ({
      ...serializeTodo(todo),
      urls: (urlsByTodoId.get(todo.id.toLowerCase()) ?? []).map(serializeUrl),
    })),
  );
}

// GET /todos/:id - Get a single todo with URLs
export async function getTodo(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  if (!todoId) {
    return apiError(c, "todo_id_required");
  }
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!todo) {
    return apiError(c, "todo_not_found");
  }

  const urls = await db
    .select()
    .from(todoUrls)
    .where(eq(todoUrls.todoId, todoId))
    .orderBy(todoUrls.position);

  return c.json({
    ...serializeTodo(todo),
    urls: urls.map(serializeUrl),
  });
}
