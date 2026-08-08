import type { Context } from "hono";
import { and, eq, getDb, todoSuggestions, todos } from "../lib/db";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

// Notify all connected WebSocket clients for this user to sync. Inlined
// (rather than imported from lib/ai-enrich) so this handler isn't coupled to
// that module's test mock, which stubs out AI-enrichment entirely.
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical - clients will sync on next poll
  }
}

/**
 * POST /todos/:id/suggestions/:sid/dismiss
 *
 * Marks a suggestion dismissed. Terminal — a dismissed suggestion never
 * reappears, including across future re-enrich runs.
 */
export async function dismissSuggestion(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  const suggestionId = c.req.param("sid")?.toLowerCase();
  if (!todoId) return apiError(c, "todo_id_required");
  if (!suggestionId) return apiError(c, "suggestion_id_required");

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  if (!todo) return apiError(c, "todo_not_found");

  const [suggestion] = await db
    .select({ id: todoSuggestions.id, status: todoSuggestions.status })
    .from(todoSuggestions)
    .where(
      and(
        eq(todoSuggestions.id, suggestionId),
        eq(todoSuggestions.todoId, todoId),
      ),
    );
  if (!suggestion) return apiError(c, "suggestion_not_found");
  if (suggestion.status !== "pending") {
    return apiError(c, "suggestion_not_pending");
  }

  await db
    .update(todoSuggestions)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(eq(todoSuggestions.id, suggestionId));

  await notifySync(c.env, userId);

  return c.json({ id: suggestionId, status: "dismissed" });
}
