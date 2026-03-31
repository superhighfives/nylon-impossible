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
  users,
} from "../lib/db";
import type { Env, ResearchJobMessage } from "../types";

// Validation schemas
const createTodoSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
});

const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  position: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  priority: z.enum(["high", "low"]).nullable().optional(),
  updatedAt: z.coerce.date().optional(),
});

// Serialize a todo with ISO dates
function serializeTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    title: todo.title,
    notes: todo.notes,
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

  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.notes !== undefined)
    updates.notes = parsed.data.notes;
  if (parsed.data.completed !== undefined)
    updates.completed = parsed.data.completed;
  if (parsed.data.position !== undefined)
    updates.position = parsed.data.position;
  if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate;
  if (parsed.data.priority !== undefined)
    updates.priority = parsed.data.priority;

  await db
    .update(todos)
    .set(updates)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  const [updated] = await db.select().from(todos).where(eq(todos.id, todoId));

  // Re-fire research when the title changes and research already exists
  const titleChanged =
    parsed.data.title !== undefined && parsed.data.title !== existing.title;

  if (titleChanged) {
    const [research] = await db
      .select({ id: todoResearch.id, researchType: todoResearch.researchType })
      .from(todoResearch)
      .where(eq(todoResearch.todoId, todoId));

    if (research) {
      await db.delete(todoUrls).where(eq(todoUrls.researchId, research.id));
      await db.delete(todoResearch).where(eq(todoResearch.id, research.id));

      const newResearchId = crypto.randomUUID();
      const now = new Date();
      await db.insert(todoResearch).values({
        id: newResearchId,
        todoId,
        researchType: research.researchType,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      const [user] = await db
        .select({ location: users.location })
        .from(users)
        .where(eq(users.id, userId));

      const query = parsed.data.title ?? existing.title;

      await c.env.RESEARCH_QUEUE.send({
        todoId,
        userId,
        query,
        researchType: research.researchType,
        researchId: newResearchId,
        userLocation: user?.location ?? null,
      } satisfies ResearchJobMessage);
    }
  }

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

  // Cancel any pending research so the queue consumer exits cleanly via the
  // cancel guard rather than hitting a FK violation when the todo is gone.
  await db
    .update(todoResearch)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(eq(todoResearch.todoId, todoId), eq(todoResearch.status, "pending")),
    );

  await db.delete(todos).where(eq(todos.id, todoId));

  return c.json({ success: true });
}
