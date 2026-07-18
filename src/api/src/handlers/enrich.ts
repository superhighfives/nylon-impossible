import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { enrichOrAskWithAI } from "../lib/ai-enrich";
import { and, eq, getDb, todos, users } from "../lib/db";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

/**
 * POST /todos/:id/enrich
 *
 * On-demand AI enrichment for an existing todo. AI is intentional — nothing
 * enriches automatically — so this backs the explicit per-todo "Enrich" action.
 * Gated on the `aiEnabled` master switch (the UI hides it otherwise, but the
 * endpoint is public so we enforce it here). Runs enrichment in the background
 * against the todo's current title, preserving any due date the user already set.
 */
export async function enrichTodo(c: Context<Env>) {
  const idParam = c.req.param("id");
  if (!idParam) {
    return apiError(c, "todo_id_required");
  }
  // Enrichment runs Workers AI, so it honours the aiEnabled master switch.
  if (!c.get("aiEnabled")) {
    return apiError(c, "ai_disabled");
  }

  const todoId = idParam.toLowerCase();
  const userId = c.get("userId");
  const db = getDb(c.env.DB);

  const [todo] = await db
    .select({
      id: todos.id,
      title: todos.title,
      dueDate: todos.dueDate,
    })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!todo) {
    return apiError(c, "todo_not_found");
  }

  // Flag it pending immediately so the triggering client shows a spinner on the
  // next refetch; enrichOrAskWithAI flips it to processing → complete.
  const now = new Date();
  await db
    .update(todos)
    .set({ aiStatus: "pending", updatedAt: now })
    .where(eq(todos.id, todoId));

  const [user] = await db
    .select({ location: users.location })
    .from(users)
    .where(eq(users.id, userId));

  c.executionCtx.waitUntil(
    enrichOrAskWithAI(
      db,
      c.env.AI,
      c.env,
      todoId,
      userId,
      todo.title,
      user?.location,
      undefined,
      // Manual enrichment must not clobber a due date the user already set.
      { preserveExistingDueDate: true, existingDueDate: todo.dueDate },
    ),
  );

  Sentry.addBreadcrumb({
    category: "todo",
    message: "todo.enrich",
    data: { manual: true },
    level: "info",
  });

  return c.json({ status: "pending" });
}
