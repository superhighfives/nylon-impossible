import type { Context } from "hono";
import { z } from "zod/v4";
import { and, eq, getDb, todos } from "../lib/db";
import type { Env } from "../types";

// Validation schemas
const createTodoSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
});

const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  position: z.string().optional(),
  updatedAt: z.coerce.date().optional(),
});

// GET /todos - List all todos for user
export async function listTodos(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const userTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.createdAt);

  return c.json(userTodos);
}

// POST /todos - Create a new todo
export async function createTodo(c: Context<Env>) {
  const body = await c.req.json();
  const parsed = createTodoSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const id = parsed.data.id ?? crypto.randomUUID();
  const now = new Date();

  await db.insert(todos).values({
    id,
    userId,
    title: parsed.data.title,
    completed: false,
    createdAt: now,
    updatedAt: now,
  });

  const [newTodo] = await db.select().from(todos).where(eq(todos.id, id));

  return c.json(newTodo, 201);
}

// PUT /todos/:id - Update a todo
export async function updateTodo(c: Context<Env>) {
  const todoId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateTodoSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  // Check ownership
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!existing) {
    return c.json({ error: "Todo not found" }, 404);
  }

  const updates: Record<string, unknown> = {
    updatedAt: parsed.data.updatedAt ?? new Date(),
  };

  if (parsed.data.title !== undefined) {
    updates.title = parsed.data.title;
  }
  if (parsed.data.completed !== undefined) {
    updates.completed = parsed.data.completed;
  }
  if (parsed.data.position !== undefined) {
    updates.position = parsed.data.position;
  }

  await db.update(todos).set(updates).where(eq(todos.id, todoId));

  const [updated] = await db.select().from(todos).where(eq(todos.id, todoId));

  return c.json(updated);
}

// DELETE /todos/:id - Delete a todo
export async function deleteTodo(c: Context<Env>) {
  const todoId = c.req.param("id");
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  // Check ownership
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!existing) {
    return c.json({ error: "Todo not found" }, 404);
  }

  await db.delete(todos).where(eq(todos.id, todoId));

  return c.json({ success: true });
}
