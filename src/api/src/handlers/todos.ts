import type { Context } from "hono";
import { z } from "zod/v4";
import { and, asc, eq, getDb, inArray, todos, todoUrls } from "../lib/db";
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

// Serialize a todo with ISO dates
function serializeTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    title: todo.title,
    description: todo.description,
    completed: todo.completed,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    priority: todo.priority,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

// Serialize a URL record with ISO dates
function serializeUrl(url: typeof todoUrls.$inferSelect) {
  return {
    id: url.id.toLowerCase(),
    todoId: url.todoId.toLowerCase(),
    url: url.url,
    title: url.title,
    description: url.description,
    siteName: url.siteName,
    favicon: url.favicon,
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
    const CHUNK_SIZE = 100;
    for (let i = 0; i < todoIds.length; i += CHUNK_SIZE) {
      const chunkIds = todoIds.slice(i, i + CHUNK_SIZE);
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
    return c.json({ error: "Todo ID required" }, 400);
  }
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!todo) {
    return c.json({ error: "Todo not found" }, 404);
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

  return c.json(serializeTodo(newTodo), 201);
}

// PUT /todos/:id - Update a todo
export async function updateTodo(c: Context<Env>) {
  const todoId = c.req.param("id");
  if (!todoId) {
    return c.json({ error: "Todo ID required" }, 400);
  }
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

  await db
    .update(todos)
    .set(updates)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  const [updated] = await db.select().from(todos).where(eq(todos.id, todoId));

  return c.json(serializeTodo(updated));
}

// DELETE /todos/:id - Delete a todo
export async function deleteTodo(c: Context<Env>) {
  const todoId = c.req.param("id");
  if (!todoId) {
    return c.json({ error: "Todo ID required" }, 400);
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

  await db.delete(todos).where(eq(todos.id, todoId));

  return c.json({ success: true });
}
