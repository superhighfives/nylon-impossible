import { chunkForD1 } from "@nylon-impossible/shared/d1";
import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  and,
  asc,
  eq,
  getDb,
  inArray,
  todoResearch,
  todos,
  todoUrls,
} from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { getSystemListId } from "../lib/lists";
import { updateTodoCore } from "../lib/todos-core";
import type { Env } from "../types";

const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
});

// Validation schemas
const createTodoSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  listId: z.string().uuid().optional(),
});

const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  position: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  // Client-set only to undo a completed repeat (cleared to null). Normal
  // completions are stamped server-side.
  completedAt: z.coerce.date().nullable().optional(),
  updatedAt: z.coerce.date().optional(),
  sticky: z.boolean().optional(),
  listId: z.string().uuid().optional(),
});

// Serialize a todo with ISO dates
function serializeTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    parentId: todo.parentId?.toLowerCase() ?? null,
    listId: todo.listId,
    title: todo.title,
    notes: todo.notes,
    completed: todo.completed,
    completedAt: todo.completedAt?.toISOString() ?? null,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    recurrence: todo.recurrence,
    sticky: todo.sticky,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

// Serialize a URL record with ISO dates
function serializeUrl(url: typeof todoUrls.$inferSelect) {
  return {
    id: url.id.toLowerCase(),
    todoId: url.todoId.toLowerCase(),
    researchId: url.researchId,
    url: url.url,
    title: url.title,
    description: url.description,
    siteName: url.siteName,
    favicon: url.favicon,
    image: url.image,
    position: url.position,
    fetchStatus: url.fetchStatus,
    fetchedAt: url.fetchedAt?.toISOString() ?? null,
    createdAt: url.createdAt.toISOString(),
    updatedAt: url.updatedAt.toISOString(),
  };
}

// GET /todos - List all todos for user
export async function listTodos(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const userTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.createdAt);

  const todoIds = userTodos.map((t) => t.id);
  const allUrls: (typeof todoUrls.$inferSelect)[] = [];
  if (todoIds.length > 0) {
    for (const chunkIds of chunkForD1(todoIds)) {
      const chunkUrls = await db
        .select()
        .from(todoUrls)
        .where(inArray(todoUrls.todoId, chunkIds))
        .orderBy(asc(todoUrls.position));
      allUrls.push(...chunkUrls);
    }
  }

  const urlsByTodoId = new Map<string, ReturnType<typeof serializeUrl>[]>();
  for (const url of allUrls) {
    const serialized = serializeUrl(url);
    const normalizedTodoId = url.todoId.toLowerCase();
    const existing = urlsByTodoId.get(normalizedTodoId) ?? [];
    existing.push(serialized);
    urlsByTodoId.set(normalizedTodoId, existing);
  }

  return c.json(
    userTodos.map((todo) => ({
      ...serializeTodo(todo),
      urls: urlsByTodoId.get(todo.id.toLowerCase()) ?? [],
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
  const id = parsed.data.id ?? crypto.randomUUID();
  const now = new Date();

  const listId =
    parsed.data.listId ?? (await getSystemListId(db, userId, "today"));
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
  const todoId = c.req.param("id");
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

  const updated = await updateTodoCore(db, c.env, userId, todoId, parsed.data);

  if (!updated) {
    return apiError(c, "todo_not_found");
  }

  return c.json(serializeTodo(updated));
}

// DELETE /todos/:id - Delete a todo
export async function deleteTodo(c: Context<Env>) {
  const todoId = c.req.param("id");
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

  // Cancel any pending research so the queue consumer exits cleanly via the
  // cancel guard rather than hitting a FK violation when the todo is gone.
  await db
    .update(todoResearch)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(eq(todoResearch.todoId, todoId), eq(todoResearch.status, "pending")),
    );

  await db.delete(todos).where(eq(todos.id, todoId));

  Sentry.addBreadcrumb({
    category: "todo",
    message: "todo.deleted",
    level: "info",
  });

  return c.json({ success: true });
}
