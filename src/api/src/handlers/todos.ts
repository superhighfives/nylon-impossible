import { z } from "zod/v4";
import { getDb, todos, eq, and } from "../lib/db";
import { json, error, notFound } from "../lib/response";
import type { Env, AuthenticatedRequest } from "../types";

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
export async function listTodos(
  req: AuthenticatedRequest,
  env: Env
): Promise<Response> {
  const db = getDb(env.DB);

  const userTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, req.userId))
    .orderBy(todos.createdAt);

  return json(userTodos);
}

// POST /todos - Create a new todo
export async function createTodo(
  req: AuthenticatedRequest,
  env: Env
): Promise<Response> {
  const body = await req.json();
  const parsed = createTodoSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.message);
  }

  const db = getDb(env.DB);
  const id = parsed.data.id ?? crypto.randomUUID();
  const now = new Date();

  await db.insert(todos).values({
    id,
    userId: req.userId,
    title: parsed.data.title,
    completed: false,
    createdAt: now,
    updatedAt: now,
  });

  const [newTodo] = await db.select().from(todos).where(eq(todos.id, id));

  return json(newTodo, 201);
}

// PUT /todos/:id - Update a todo
export async function updateTodo(
  req: AuthenticatedRequest,
  env: Env,
  todoId: string
): Promise<Response> {
  const body = await req.json();
  const parsed = updateTodoSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.message);
  }

  const db = getDb(env.DB);

  // Check ownership
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, req.userId)));

  if (!existing) {
    return notFound("Todo");
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

  return json(updated);
}

// DELETE /todos/:id - Delete a todo
export async function deleteTodo(
  req: AuthenticatedRequest,
  env: Env,
  todoId: string
): Promise<Response> {
  const db = getDb(env.DB);

  // Check ownership
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, req.userId)));

  if (!existing) {
    return notFound("Todo");
  }

  await db.delete(todos).where(eq(todos.id, todoId));

  return json({ success: true });
}
