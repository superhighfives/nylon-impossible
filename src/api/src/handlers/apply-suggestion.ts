import type { Recurrence } from "@nylon-impossible/shared/schema";
import * as Sentry from "@sentry/cloudflare";
import { generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import {
  and,
  eq,
  getDb,
  todoResearch,
  todoSuggestions,
  todos,
  users,
} from "../lib/db";
import { apiError } from "../lib/errors";
import { truncateTitle } from "../lib/url-helpers";
import type { Env, ResearchJobMessage } from "../types";

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
 * POST /todos/:id/suggestions/:sid/accept
 *
 * Applies exactly the change a suggestion proposes, via the same fields a
 * manual edit would touch, then marks it accepted. Terminal — an accepted
 * suggestion never reapplies.
 */
export async function acceptSuggestion(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  const suggestionId = c.req.param("sid")?.toLowerCase();
  if (!todoId) return apiError(c, "todo_id_required");
  if (!suggestionId) return apiError(c, "suggestion_id_required");

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  if (!todo) return apiError(c, "todo_not_found");

  const [suggestion] = await db
    .select()
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

  const now = new Date();

  // The `type` and `payload` columns are separate — TS can't correlate them
  // into a discriminated union across two DB columns, so each case casts the
  // payload to the shape that `type` guarantees at insert time.
  switch (suggestion.type) {
    case "title": {
      const payload = suggestion.payload as { title: string };
      await db
        .update(todos)
        .set({ title: truncateTitle(payload.title), updatedAt: now })
        .where(eq(todos.id, todoId));
      break;
    }
    case "due_date": {
      const payload = suggestion.payload as { dueDate: string };
      await db
        .update(todos)
        .set({ dueDate: new Date(payload.dueDate), updatedAt: now })
        .where(eq(todos.id, todoId));
      break;
    }
    case "recurrence": {
      // Recurrence requires a dueDate anchor and is mutually exclusive with
      // having subtasks — same invariant enforced on a manual edit
      // (handlers/todos.ts:updateTodo). If it no longer holds (the todo's due
      // date was cleared, or subtasks were added, since the suggestion was
      // generated), refuse rather than leave the todo in an invalid state.
      const isSubtask = todo.parentId != null;
      let hasChildren = false;
      if (!isSubtask) {
        const [child] = await db
          .select({ id: todos.id })
          .from(todos)
          .where(and(eq(todos.parentId, todoId), eq(todos.userId, userId)))
          .limit(1);
        hasChildren = !!child;
      }
      if (!todo.dueDate || isSubtask || hasChildren) {
        return apiError(c, "suggestion_conflict");
      }
      const payload = suggestion.payload as { recurrence: Recurrence };
      await db
        .update(todos)
        .set({ recurrence: payload.recurrence, updatedAt: now })
        .where(eq(todos.id, todoId));
      break;
    }
    case "subtasks": {
      const [existingChild] = await db
        .select({ id: todos.id })
        .from(todos)
        .where(eq(todos.parentId, todoId))
        .limit(1);
      if (existingChild) {
        return apiError(c, "suggestion_conflict");
      }
      const titles = (suggestion.payload as { titles: string[] }).titles;
      const positions = generateNKeysBetween(null, null, titles.length);
      await db.insert(todos).values(
        titles.map((title, i) => ({
          id: crypto.randomUUID(),
          userId,
          parentId: todoId,
          // Subtasks are implicitly scoped to their parent's list.
          listId: todo.listId,
          listEnteredAt: now,
          title: truncateTitle(title),
          completed: false,
          position: positions[i],
          createdAt: now,
          updatedAt: now,
        })),
      );
      // Subtasks and recurrence are mutually exclusive.
      await db
        .update(todos)
        .set({ recurrence: null, updatedAt: now })
        .where(eq(todos.id, todoId));
      break;
    }
    case "research": {
      const [existingResearch] = await db
        .select({ id: todoResearch.id })
        .from(todoResearch)
        .where(eq(todoResearch.todoId, todoId));
      if (existingResearch) {
        return apiError(c, "suggestion_conflict");
      }
      const [user] = await db
        .select({ location: users.location })
        .from(users)
        .where(eq(users.id, userId));

      const payload = suggestion.payload as {
        searchQuery: string | null;
        researchType: "general" | "location";
      };
      const researchId = crypto.randomUUID();
      await db.insert(todoResearch).values({
        id: researchId,
        todoId,
        researchType: payload.researchType,
        status: "pending",
        searchQuery: payload.searchQuery,
        createdAt: now,
        updatedAt: now,
      });

      // A send failure (e.g. queue backpressure/quota) must not 500 this
      // request; mark the just-created record failed instead.
      try {
        await c.env.RESEARCH_QUEUE.send({
          todoId,
          userId,
          query: payload.searchQuery ?? todo.title,
          researchType: payload.researchType,
          researchId,
          userLocation: user?.location ?? null,
        } satisfies ResearchJobMessage);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { area: "research-queue" },
          extra: { todoId, researchId },
        });
        await db
          .update(todoResearch)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(todoResearch.id, researchId));
      }
      break;
    }
  }

  await db
    .update(todoSuggestions)
    .set({ status: "accepted", updatedAt: now })
    .where(eq(todoSuggestions.id, suggestionId));

  Sentry.addBreadcrumb({
    category: "suggestion",
    message: "suggestion.accepted",
    data: { type: suggestion.type },
    level: "info",
  });

  await notifySync(c.env, userId);

  return c.json({ id: suggestionId, status: "accepted" });
}
