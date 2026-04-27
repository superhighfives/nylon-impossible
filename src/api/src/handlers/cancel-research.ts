import type { Context } from "hono";
import { and, eq, getDb, todoResearch, todos } from "../lib/db";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

/**
 * DELETE /todos/:id/research
 *
 * Cancels pending research for a todo by marking it as failed.
 * The queue worker checks for this before marking as completed,
 * so a cancellation takes effect even while the AI is still running.
 */
export async function cancelResearch(c: Context<Env>) {
  const idParam = c.req.param("id");
  if (!idParam) {
    return apiError(c, "todo_id_required");
  }
  const todoId = idParam.toLowerCase();
  const userId = c.get("userId");
  const db = getDb(c.env.DB);

  const [todo] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!todo) {
    return apiError(c, "todo_not_found");
  }

  await db
    .update(todoResearch)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(eq(todoResearch.todoId, todoId), eq(todoResearch.status, "pending")),
    );

  // Notify clients of the status change
  try {
    const id = c.env.USER_SYNC.idFromName(userId);
    const stub = c.env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical
  }

  return c.json({ success: true });
}
