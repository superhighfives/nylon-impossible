import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { and, eq, getDb, todos } from "../lib/db";
import { apiError } from "../lib/errors";
import { finishTodoLinks, queueTodoLinks } from "../lib/process-todo";
import type { Env } from "../types";

/**
 * POST /todos/:id/process
 *
 * Re-run link processing for an existing todo: attach any URLs in its text,
 * fetch what's behind them, and replace a placeholder title ("Check x.com")
 * with what actually turned up.
 *
 * Deliberately **not** an AI action — no model runs, nothing is proposed for
 * consent, and it's ungated by `aiEnabled`. It's the deterministic work that
 * already happens on create, exposed as something the user can ask for again:
 * the retry for a link whose fetch failed, and the way a todo captured before
 * any of this existed catches up.
 */
export async function processTodo(c: Context<Env>) {
  const idParam = c.req.param("id");
  if (!idParam) {
    return apiError(c, "todo_id_required");
  }

  const todoId = idParam.toLowerCase();
  const userId = c.get("userId");
  const db = getDb(c.env.DB);

  const [todo] = await db
    .select({ id: todos.id, title: todos.title, notes: todos.notes })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!todo) {
    return apiError(c, "todo_not_found");
  }

  // Flag the links pending inline so the triggering client shows a spinner on
  // its next refetch; the fetch itself runs in the background. `refetch` because
  // an explicit press means "do it again", not "retry only what's missing".
  const links = await queueTodoLinks(db, todoId, todo, { refetch: true });

  if (links.length > 0) {
    c.executionCtx.waitUntil(finishTodoLinks(db, c.env, userId, links));
  }

  Sentry.addBreadcrumb({
    category: "todo",
    message: "todo.process",
    data: { links: links.length },
    level: "info",
  });

  return c.json({
    status: links.length > 0 ? "processing" : "idle",
    links: links.length,
  });
}
