import { TODO_TITLE_MAX, toDueDay } from "@nylon-impossible/shared";
import {
  loadUrlsByTodoId,
  serializeTodo,
  serializeUrl,
} from "@nylon-impossible/shared/serialize";
import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { z } from "zod/v4";
import { and, eq, getDb, todos, todoUrls } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { listIdSchema } from "../lib/list-id";
import { getSystemListId, verifyListOwnership } from "../lib/lists";
import { normalizePinned, pinnedRequestFields } from "../lib/pinned";
import { InvalidListError, updateTodoCore } from "../lib/todos-core";
import type { Env } from "../types";

const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
});

// Validation schemas
const createTodoSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(TODO_TITLE_MAX),
  listId: listIdSchema.optional(),
});

const updateTodoSchema = z
  .object({
    title: z.string().min(1).max(TODO_TITLE_MAX).optional(),
    notes: z.string().nullable().optional(),
    completed: z.boolean().optional(),
    position: z.string().optional(),
    // Normalized to UTC midnight — due dates are calendar days.
    dueDate: z.coerce.date().transform(toDueDay).nullable().optional(),
    recurrence: recurrenceSchema.nullable().optional(),
    // Client-set only to undo a completed repeat (cleared to null). Normal
    // completions are stamped server-side.
    completedAt: z.coerce.date().nullable().optional(),
    updatedAt: z.coerce.date().optional(),
    ...pinnedRequestFields,
    listId: listIdSchema.optional(),
  })
  .transform(normalizePinned);

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

// POST /todos - Create a new todo
export async function createTodo(c: Context<Env>) {
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = createTodoSchema.safeParse(json.body);

  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  // iOS sends `uuidString`, which is uppercase; every other writer and every
  // lookup uses lowercase.
  const id = (parsed.data.id ?? crypto.randomUUID()).toLowerCase();
  const now = new Date();

  const listId = parsed.data.listId
    ? await verifyListOwnership(db, userId, parsed.data.listId)
    : await getSystemListId(db, userId, "today");
  if (!listId) {
    return apiError(c, "list_not_found");
  }

  await db.insert(todos).values({
    id,
    userId,
    listId,
    listEnteredAt: now,
    title: parsed.data.title,
    completed: false,
    createdAt: now,
    updatedAt: now,
  });

  const [newTodo] = await db.select().from(todos).where(eq(todos.id, id));

  Sentry.addBreadcrumb({
    category: "todo",
    message: "todo.created",
    data: { method: "manual" },
    level: "info",
  });

  return c.json(serializeTodo(newTodo), 201);
}

// PUT /todos/:id - Update a todo
export async function updateTodo(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  if (!todoId) {
    return apiError(c, "todo_id_required");
  }
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = updateTodoSchema.safeParse(json.body);

  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  let updated: Awaited<ReturnType<typeof updateTodoCore>>;
  try {
    updated = await updateTodoCore(db, c.env, userId, todoId, parsed.data);
  } catch (error) {
    if (error instanceof InvalidListError) {
      return apiError(c, "list_not_found");
    }
    throw error;
  }

  if (!updated) {
    return apiError(c, "todo_not_found");
  }

  return c.json(serializeTodo(updated));
}

// DELETE /todos/:id - Delete a todo
export async function deleteTodo(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  if (!todoId) {
    return apiError(c, "todo_id_required");
  }
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  // Check ownership
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!existing) {
    return apiError(c, "todo_not_found");
  }

  await db.delete(todos).where(eq(todos.id, todoId));

  Sentry.addBreadcrumb({
    category: "todo",
    message: "todo.deleted",
    level: "info",
  });

  return c.json({ success: true });
}
