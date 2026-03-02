import { generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import { extractTodos } from "../lib/ai";
import { eq, getDb, todos } from "../lib/db";
import { shouldUseAI } from "../lib/smart-input";
import type { Env } from "../types";

const smartCreateSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text is too long"),
});

function serializeTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    title: todo.title,
    completed: todo.completed,
    position: todo.position,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

// POST /todos/smart
export async function smartCreate(c: Context<Env>) {
  const body = await c.req.json();
  const parsed = smartCreateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const text = parsed.data.text.trim();
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  // Get the lowest position so new todos are prepended at the start
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows[0]);

  const firstPosition = firstTodo?.position ?? null;

  if (shouldUseAI(text)) {
    // AI path: extract and create multiple todos
    let extracted: Array<{ title: string }> | null;

    try {
      extracted = await extractTodos(c.env.AI, c.env.AI_GATEWAY_ID, text);
    } catch (error) {
      // Fallback: create single todo with original text on AI failure
      console.error(
        "AI extraction failed, falling back to single todo:",
        error,
      );
      return createAndReturn(db, c, userId, [{ title: text }], firstPosition);
    }

    // If AI returned null or empty, fall back to single todo
    if (!extracted || extracted.length === 0) {
      return createAndReturn(db, c, userId, [{ title: text }], firstPosition);
    }

    return createAndReturn(db, c, userId, extracted, firstPosition, true);
  }

  // Fast path: create single todo directly
  return createAndReturn(db, c, userId, [{ title: text }], firstPosition);
}

/** Batch-insert todos, fetch them back in one query, and return the response. */
async function createAndReturn(
  db: ReturnType<typeof getDb>,
  c: Context<Env>,
  userId: string,
  items: Array<{ title: string }>,
  firstPosition: string | null,
  ai = false,
) {
  const now = new Date();
  const ids: string[] = [];

  // Generate N positions before the first existing todo
  const positions = generateNKeysBetween(null, firstPosition, items.length);

  // Build all values up-front so we can batch the insert
  const rows = items.map((item, i) => {
    const id = crypto.randomUUID();
    ids.push(id);
    return {
      id,
      userId,
      title: item.title,
      completed: false as const,
      position: positions[i],
      createdAt: now,
      updatedAt: now,
    };
  });

  // Single batch insert
  await db.insert(todos).values(rows);

  // Single select to retrieve all created todos (preserves insertion order)
  const created = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .then((all) => {
      const idSet = new Set(ids);
      return all.filter((t) => idSet.has(t.id));
    });

  // Sort to match insertion order
  const idOrder = new Map(ids.map((id, i) => [id, i]));
  created.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  await notifySync(c.env, userId);

  return c.json({ todos: created.map(serializeTodo), ai });
}

/** Notify all connected WebSocket clients for this user to sync */
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
) {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical — clients will sync on next poll
  }
}
