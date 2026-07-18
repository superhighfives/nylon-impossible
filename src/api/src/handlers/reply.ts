import type { Context } from "hono";
import { z } from "zod/v4";
import { enrichOrAskWithAI } from "../lib/ai-enrich";
import { and, asc, eq, getDb, todoMessages, todos, users } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import type { Env } from "../types";

const replySchema = z.object({
  content: z.string().min(1).max(2000),
});

// POST /todos/:id/reply — user answers the agent's clarifying question.
export async function replyToTodo(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  if (!todoId) return apiError(c, "todo_id_required");

  // Replies re-run the AI enrichment/conversation agent, so this honours the
  // aiEnabled master switch. The conversation UI is hidden when AI is off, but
  // the endpoint is public — gate it server-side so a crafted request can't
  // spend AI credits while AI is disabled.
  if (!c.get("aiEnabled")) {
    return apiError(c, "ai_disabled");
  }

  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = replySchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  if (!todo) return apiError(c, "todo_not_found");

  const now = new Date();

  // Insert the user's reply.
  const messageId = crypto.randomUUID();
  await db.insert(todoMessages).values({
    id: messageId,
    todoId,
    role: "user",
    content: parsed.data.content,
    createdAt: now,
    awaitingReply: false,
  });

  // Clear awaiting_reply on any open assistant messages in one UPDATE.
  // `needs_input` already guarantees at most one is open, so this is both
  // simpler and more robust than a SELECT-then-UPDATE on the most recent.
  // (Same approach as the dismiss endpoint.)
  await db
    .update(todoMessages)
    .set({ awaitingReply: false })
    .where(
      and(
        eq(todoMessages.todoId, todoId),
        eq(todoMessages.awaitingReply, true),
      ),
    );

  // Clear needs_input on the todo, bump updatedAt for sync.
  await db
    .update(todos)
    .set({ needsInput: false, updatedAt: now })
    .where(eq(todos.id, todoId));

  // Load full conversation history (oldest-first) for re-enrichment.
  const history = await db
    .select()
    .from(todoMessages)
    .where(eq(todoMessages.todoId, todoId))
    .orderBy(asc(todoMessages.createdAt));

  // Fetch user location for research bias.
  const [user] = await db
    .select({ location: users.location })
    .from(users)
    .where(eq(users.id, userId));

  // Notify sync immediately so the user sees their message, then re-enrich in
  // the background with the full conversation.
  await notifySync(c.env, userId);

  c.executionCtx.waitUntil(
    enrichOrAskWithAI(
      db,
      c.env.AI,
      c.env,
      todoId,
      userId,
      todo.title,
      user?.location ?? null,
      history.map((m) => ({ role: m.role, content: m.content })),
    ),
  );

  return c.json({ id: messageId.toLowerCase() }, 201);
}

async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
) {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical
  }
}
