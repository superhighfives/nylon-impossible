import {
  nextDueDate,
  placementForDueDate,
} from "@nylon-impossible/shared/recurrence";
import type { Env, ResearchJobMessage } from "../types";
import {
  and,
  asc,
  desc,
  eq,
  type getDb,
  isNull,
  todoMessages,
  todoResearch,
  todos,
  todoUrls,
  users,
} from "./db";
import { getSystemListId } from "./lists";
import { notifySync } from "./notify-sync";

type Db = ReturnType<typeof getDb>;
type Bindings = Env["Bindings"];
type Todo = typeof todos.$inferSelect;

/**
 * Fields `updateTodoCore` accepts. Mirrors the REST `PUT /todos/:id` body,
 * minus request-shape concerns (no zod here — validation/coercion is the
 * caller's job; REST validates via zod, the todo-agent's tools validate via
 * their own tool schema).
 */
export interface UpdateTodoPatch {
  title?: string;
  notes?: string | null;
  completed?: boolean;
  position?: string;
  dueDate?: Date | null;
  recurrence?: Todo["recurrence"] | null;
  // Client-set only to undo a completed repeat (cleared to null). Normal
  // completions are stamped server-side.
  completedAt?: Date | null;
  updatedAt?: Date;
  sticky?: boolean;
  listId?: string;
}

/**
 * The user's open, top-level todos in the Today list, in list order. Shared
 * by the Gmail add-on homepage card and any REST surface that needs the same
 * "what's on my plate" view, so the two can't drift. Excludes completed
 * todos and subtasks (parentId IS NULL), matching the top-level list shown
 * on web/iOS. Scoped to Today only — the Gmail add-on doesn't yet surface
 * This Week/Sometime/custom lists.
 */
export async function listOpenTodos(db: Db, userId: string) {
  const todayListId = await getSystemListId(db, userId, "today");
  if (!todayListId) return [];

  return db
    .select({
      id: todos.id,
      title: todos.title,
      position: todos.position,
      dueDate: todos.dueDate,
    })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.listId, todayListId),
        isNull(todos.parentId),
        eq(todos.completed, false),
      ),
    )
    .orderBy(desc(todos.sticky), asc(todos.position));
}

/**
 * Toggle a top-level todo's completed state, applying the same server-canonical
 * rules as the REST `updateTodo` handler:
 *   - a recurring todo being completed rolls its dueDate forward instead of
 *     persisting the completion (completed stays false, completedAt stamped),
 *   - completing a todo with an open question clears needsInput + awaitingReply,
 *   - completing a sticky todo clears sticky,
 *   - completion cascades to subtasks.
 * Then pokes connected web/iOS clients to sync. Returns the updated row, or
 * null if the todo doesn't exist or isn't owned by `userId`.
 */
export async function setTodoCompleted(
  db: Db,
  env: Bindings,
  userId: string,
  todoId: string,
  completed: boolean,
): Promise<typeof todos.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!existing) return null;

  const now = new Date();
  const updates: Record<string, unknown> = { completed, updatedAt: now };

  const completingRow = completed === true && existing.completed === false;

  // Recurrence and subtasks are mutually exclusive: a subtask never recurs and
  // a todo with children can't recur. A recurring todo being completed advances
  // its dueDate to the next occurrence rather than persisting the completion.
  let recurrence = existing.recurrence;
  if (recurrence) {
    const isSubtask = existing.parentId != null;
    let hasChildren = false;
    if (!isSubtask) {
      const [child] = await db
        .select({ id: todos.id })
        .from(todos)
        .where(and(eq(todos.parentId, todoId), eq(todos.userId, userId)))
        .limit(1);
      hasChildren = !!child;
    }
    if (isSubtask || hasChildren) recurrence = null;
  }
  if (completingRow && recurrence && existing.dueDate) {
    const nextDue = nextDueDate(recurrence, existing.dueDate, now);
    updates.completed = false;
    updates.completedAt = now;
    updates.dueDate = nextDue;
    // The new occurrence is placed by its due date's distance, per the
    // settled recurrence heuristic — then ages normally afterward.
    const placementListId = await getSystemListId(
      db,
      userId,
      placementForDueDate(nextDue, now),
    );
    if (placementListId && placementListId !== existing.listId) {
      updates.listId = placementListId;
      updates.listEnteredAt = now;
    }
  }

  // Completing a todo with an open question clears the question automatically.
  if (completingRow && existing.needsInput) {
    updates.needsInput = false;
    await db
      .update(todoMessages)
      .set({ awaitingReply: false })
      .where(
        and(
          eq(todoMessages.todoId, todoId),
          eq(todoMessages.awaitingReply, true),
        ),
      );
  }

  // Completing a sticky todo unsticks it — it sorts as an ordinary completed
  // todo, not pinned.
  if (completingRow && existing.sticky) updates.sticky = false;

  await db
    .update(todos)
    .set(updates)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  // Completion cascade: toggling a top-level todo's completed flag cascades to
  // its subtasks (checking completes them; unchecking reopens them).
  if (existing.parentId == null && completed !== existing.completed) {
    await db
      .update(todos)
      .set({ completed, updatedAt: now })
      .where(and(eq(todos.parentId, todoId), eq(todos.userId, userId)));
  }

  const [updated] = await db.select().from(todos).where(eq(todos.id, todoId));

  await notifySync(env, userId);

  return updated;
}

/**
 * Apply a patch to a todo (title/notes/completed/position/dueDate/recurrence/
 * completedAt/sticky), applying the same server-canonical rules the REST
 * `PUT /todos/:id` handler always has:
 *   - a recurring todo being completed for the first time rolls its dueDate
 *     forward instead of persisting the completion,
 *   - recurrence and subtasks are mutually exclusive (server-enforced),
 *   - completing a todo with an open question clears needsInput + awaitingReply,
 *   - completing a sticky todo clears sticky,
 *   - completion cascades to subtasks,
 *   - a title change re-fires research (if research already ran) against the
 *     new title.
 * Then pokes connected web/iOS clients to sync. Returns the updated row, or
 * null if the todo doesn't exist or isn't owned by `userId` — callers decide
 * how to surface that (REST returns 404; a tool call reports failure back to
 * the agent).
 */
export async function updateTodoCore(
  db: Db,
  env: Bindings,
  userId: string,
  todoId: string,
  patch: UpdateTodoPatch,
): Promise<Todo | null> {
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  if (!existing) return null;

  const updatedAt = patch.updatedAt ?? new Date();
  const updates: Record<string, unknown> = { updatedAt };

  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.completed !== undefined) updates.completed = patch.completed;
  if (patch.position !== undefined) updates.position = patch.position;
  if (patch.dueDate !== undefined) updates.dueDate = patch.dueDate;
  if (patch.recurrence !== undefined) updates.recurrence = patch.recurrence;
  // completedAt is caller-set only to undo a completed repeat (null); a normal
  // completion stamps it server-side just below.
  if (patch.completedAt !== undefined) updates.completedAt = patch.completedAt;
  if (patch.sticky !== undefined) updates.sticky = patch.sticky;
  if (patch.listId !== undefined && patch.listId !== existing.listId) {
    updates.listId = patch.listId;
    updates.listEnteredAt = updatedAt;
  }

  // Server-canonical advance: when a recurring todo is being marked complete
  // for the first time, advance dueDate to the next future occurrence and keep
  // completed = false instead of persisting the completion. The client does the
  // same advance optimistically; the server's result is authoritative.
  const completingRow =
    patch.completed === true && existing.completed === false;
  // Recurrence and subtasks are mutually exclusive. A subtask never recurs, and
  // a todo with children can't recur. Enforce server-side.
  let recurrence =
    patch.recurrence !== undefined ? patch.recurrence : existing.recurrence;
  if (recurrence) {
    const isSubtask = existing.parentId != null;
    let hasChildren = false;
    if (!isSubtask) {
      const [child] = await db
        .select({ id: todos.id })
        .from(todos)
        .where(and(eq(todos.parentId, todoId), eq(todos.userId, userId)))
        .limit(1);
      hasChildren = !!child;
    }
    if (isSubtask || hasChildren) recurrence = null;
  }
  if (patch.recurrence !== undefined) updates.recurrence = recurrence;
  const anchor = patch.dueDate !== undefined ? patch.dueDate : existing.dueDate;
  if (completingRow && recurrence && anchor) {
    const now = new Date();
    const nextDue = nextDueDate(recurrence, anchor, now);
    updates.completed = false;
    updates.completedAt = now;
    updates.dueDate = nextDue;
    // The new occurrence is placed by its due date's distance, per the
    // settled recurrence heuristic — unless the caller also explicitly
    // moved it in this same patch, which wins.
    if (patch.listId === undefined) {
      const placementListId = await getSystemListId(
        db,
        userId,
        placementForDueDate(nextDue, now),
      );
      if (placementListId && placementListId !== existing.listId) {
        updates.listId = placementListId;
        updates.listEnteredAt = now;
      }
    }
  }

  // Completing a todo with an open question clears the question automatically.
  if (completingRow && existing.needsInput) {
    updates.needsInput = false;
    await db
      .update(todoMessages)
      .set({ awaitingReply: false })
      .where(
        and(
          eq(todoMessages.todoId, todoId),
          eq(todoMessages.awaitingReply, true),
        ),
      );
  }

  // Completing a sticky todo unsticks it — it sorts as an ordinary completed
  // todo, not pinned.
  if (completingRow && existing.sticky) updates.sticky = false;

  await db
    .update(todos)
    .set(updates)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

  // Completion cascade: toggling a top-level todo's completed flag cascades to
  // its subtasks (checking completes them; unchecking reopens them). Subtasks
  // never recur, so completedAt stays null like ordinary completions.
  if (
    existing.parentId == null &&
    patch.completed !== undefined &&
    patch.completed !== existing.completed
  ) {
    await db
      .update(todos)
      .set({ completed: patch.completed, updatedAt })
      .where(and(eq(todos.parentId, todoId), eq(todos.userId, userId)));
  }

  const [updated] = await db.select().from(todos).where(eq(todos.id, todoId));

  // Re-fire research when the title changes and research already exists.
  const titleChanged =
    patch.title !== undefined && patch.title !== existing.title;
  if (titleChanged) {
    const [research] = await db
      .select({ id: todoResearch.id, researchType: todoResearch.researchType })
      .from(todoResearch)
      .where(eq(todoResearch.todoId, todoId));

    if (research) {
      await db.delete(todoUrls).where(eq(todoUrls.researchId, research.id));
      await db.delete(todoResearch).where(eq(todoResearch.id, research.id));

      const newResearchId = crypto.randomUUID();
      const now = new Date();
      await db.insert(todoResearch).values({
        id: newResearchId,
        todoId,
        researchType: research.researchType,
        status: "pending",
        // Title-edit changed the topic — discard the previous searchQuery
        // and let this run fall back to the new title until the user
        // re-enriches. (No LLM call here to keep edits cheap.)
        searchQuery: null,
        createdAt: now,
        updatedAt: now,
      });

      const [user] = await db
        .select({ location: users.location })
        .from(users)
        .where(eq(users.id, userId));

      const query = patch.title ?? existing.title;

      await env.RESEARCH_QUEUE.send({
        todoId,
        userId,
        query,
        researchType: research.researchType,
        researchId: newResearchId,
        userLocation: user?.location ?? null,
      } satisfies ResearchJobMessage);
    }
  }

  await notifySync(env, userId);

  return updated;
}
