import { generateKeyBetween } from "fractional-indexing";
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

  // Get the last position for ordering new todos after existing ones
  const lastTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows.at(-1));

  let lastPosition = lastTodo?.position ?? null;

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
      const position = generateKeyBetween(lastPosition, null);
      const id = crypto.randomUUID();
      const now = new Date();

      await db.insert(todos).values({
        id,
        userId,
        title: text,
        completed: false,
        position,
        createdAt: now,
        updatedAt: now,
      });

      const [created] = await db.select().from(todos).where(eq(todos.id, id));

      await notifySync(c.env, userId);

      return c.json({ todos: [serializeTodo(created)], ai: false });
    }

    // Create each extracted todo
    const createdTodos = [];
    for (const item of extracted) {
      const position = generateKeyBetween(lastPosition, null);
      lastPosition = position;

      const id = crypto.randomUUID();
      const now = new Date();

      await db.insert(todos).values({
        id,
        userId,
        title: item.title,
        completed: false,
        position,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        createdAt: now,
        updatedAt: now,
      });

      const [created] = await db.select().from(todos).where(eq(todos.id, id));

      createdTodos.push(serializeTodo(created));
    }

    await notifySync(c.env, userId);

    return c.json({ todos: createdTodos, ai: true });
  }

  // Fast path: create single todo directly
  const position = generateKeyBetween(lastPosition, null);
  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(todos).values({
    id,
    userId,
    title: text,
    completed: false,
    position,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db.select().from(todos).where(eq(todos.id, id));

  await notifySync(c.env, userId);

  return c.json({ todos: [serializeTodo(created)], ai: false });
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
