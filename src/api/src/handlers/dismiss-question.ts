import type { Context } from "hono";
import { and, eq, getDb, todoMessages, todos } from "../lib/db";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

// DELETE /todos/:id/question — dismiss the agent's open question without
// answering. The message stays in history; only the awaiting/needs-input
// flags clear. Does NOT trigger re-enrichment.
export async function dismissQuestion(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  if (!todoId) return apiError(c, "todo_id_required");

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  if (!todo) return apiError(c, "todo_not_found");

  const now = new Date();

  // Clear awaiting_reply on any open assistant messages.
  await db
    .update(todoMessages)
    .set({ awaitingReply: false })
    .where(
      and(
        eq(todoMessages.todoId, todoId),
        eq(todoMessages.awaitingReply, true),
      ),
    );

  // Clear needs_input and bump updatedAt for sync.
  await db
    .update(todos)
    .set({ needsInput: false, updatedAt: now })
    .where(eq(todos.id, todoId));

  // Notify sync.
  try {
    const id = c.env.USER_SYNC.idFromName(userId);
    const stub = c.env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical
  }

  return c.json({ success: true });
}
