import { generateKeyBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import { extractTodos } from "../lib/ai";
import { desc, eq, getDb, todos } from "../lib/db";
import { shouldUseAI } from "../lib/smart-input";
import type { Env } from "../types";

const smartCreateSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text is too long"),
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate an AI-returned date string. Returns a Date or null. */
function parseAIDate(value: string | null): Date | null {
  if (!value || !ISO_DATE_RE.test(value)) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

function serializeTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    title: todo.title,
    completed: todo.completed,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
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

  // Get the highest position so new todos are appended at the end
  const lastTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(desc(todos.position))
    .limit(1)
    .then((rows) => rows[0]);

  const lastPosition = lastTodo?.position ?? null;

  if (shouldUseAI(text)) {
    // AI path: extract and create multiple todos
    let extracted: Array<{ title: string; dueDate: string | null }>;

    try {
      extracted = await extractTodos(c.env.AI, text);
    } catch (error) {
      // Fallback: create single todo with original text on AI failure
      console.error(
        "AI extraction failed, falling back to single todo:",
        error,
      );
      return createAndReturn(db, c, userId, [{ title: text }], lastPosition);
    }

    return createAndReturn(db, c, userId, extracted, lastPosition, true);
  }

  // Fast path: create single todo directly
  return createAndReturn(db, c, userId, [{ title: text }], lastPosition);
}

/** Batch-insert todos, fetch them back in one query, and return the response. */
async function createAndReturn(
  db: ReturnType<typeof getDb>,
  c: Context<Env>,
  userId: string,
  items: Array<{ title: string; dueDate?: string | null }>,
  lastPosition: string | null,
  ai = false,
) {
  const now = new Date();
  const ids: string[] = [];

  // Build all values up-front so we can batch the insert
  const rows = items.map((item) => {
    const position = generateKeyBetween(lastPosition, null);
    lastPosition = position;
    const id = crypto.randomUUID();
    ids.push(id);
    return {
      id,
      userId,
      title: item.title,
      completed: false as const,
      position,
      dueDate: parseAIDate(item.dueDate ?? null),
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
