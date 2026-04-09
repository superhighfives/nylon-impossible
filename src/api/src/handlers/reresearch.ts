import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import {
  and,
  eq,
  getDb,
  todoResearch,
  todos,
  todoUrls,
  users,
} from "../lib/db";
import type { Env, ResearchJobMessage } from "../types";

/**
 * POST /todos/:id/research
 *
 * Idempotent re-research endpoint. Deletes existing research record
 * (cascades to source URLs) and creates a fresh pending one, then
 * kicks off background research.
 */
export async function reresearchTodo(c: Context<Env>) {
  const idParam = c.req.param("id");
  if (!idParam) {
    return c.json({ error: "Todo ID required" }, 400);
  }
  const todoId = idParam.toLowerCase();
  const userId = c.get("userId");
  const db = getDb(c.env.DB);

  // Verify the todo exists and belongs to this user
  const [todo] = await db
    .select({
      id: todos.id,
      title: todos.title,
      userId: todos.userId,
    })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!todo) {
    return c.json({ error: "Todo not found" }, 404);
  }

  // Delete existing research (cascades to source URLs with researchId)
  const [existingResearch] = await db
    .select({ id: todoResearch.id, researchType: todoResearch.researchType })
    .from(todoResearch)
    .where(eq(todoResearch.todoId, todoId));

  // Get the research type from existing record or default to general
  const researchType = existingResearch?.researchType ?? "general";

  if (existingResearch) {
    // Delete URLs linked to this research (FK cascade should handle this,
    // but we do it explicitly to be safe)
    await db
      .delete(todoUrls)
      .where(eq(todoUrls.researchId, existingResearch.id));

    // Delete the research record
    await db
      .delete(todoResearch)
      .where(eq(todoResearch.id, existingResearch.id));
  }

  // Create new pending research record
  const now = new Date();
  const newResearchId = crypto.randomUUID();
  await db.insert(todoResearch).values({
    id: newResearchId,
    todoId,
    researchType,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  // Fetch user's location for location research
  const [user] = await db
    .select({ location: users.location })
    .from(users)
    .where(eq(users.id, userId));

  // Enqueue research job — runs in a separate Worker invocation
  await c.env.RESEARCH_QUEUE.send({
    todoId,
    userId,
    query: todo.title,
    researchType,
    researchId: newResearchId,
    userLocation: user?.location ?? null,
  } satisfies ResearchJobMessage);

  Sentry.addBreadcrumb({
    category: "research",
    message: "research.triggered",
    data: { type: researchType },
    level: "info",
  });

  return c.json({
    id: newResearchId,
    status: "pending",
    researchType,
  });
}
