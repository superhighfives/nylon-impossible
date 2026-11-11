import { toDueDay } from "@nylon-impossible/shared";
import {
  getSystemListId,
  getUserTimezone,
} from "@nylon-impossible/shared/queries";
import {
  nextDueDate,
  placementForDueDate,
} from "@nylon-impossible/shared/recurrence";
import type { Env } from "../types";
import {
  and,
  asc,
  desc,
  eq,
  type getDb,
  gte,
  isNull,
  lists,
  or,
  todos,
} from "./db";
import { notifySync } from "./notify-sync";

type Db = ReturnType<typeof getDb>;
type Bindings = Env["Bindings"];

/**
 * The user's open, top-level todos across every list (system and custom), in
 * list order then item order. Used by the Gmail add-on homepage card, and by
 * anything else that needs the same "what's on my plate" view, so the two
 * can't drift. Excludes completed todos and subtasks (parentId IS NULL),
 * matching the top-level list shown on web/iOS — except, with `doneSince`,
 * todos finished since then, which keep their place (`completed` is true).
 * An ordinary completion only bumps `updatedAt` (`completedAt` is stamped
 * when a repeat rolls forward), so that's what the window reads.
 *
 * Ordered by `lists.position` first — system lists are seeded before any
 * custom list and keep lower positions, so this naturally sorts Today / This
 * Week / Someday ahead of custom lists in creation/reorder order — then by
 * pinned/position within each list, matching the web board's own ordering.
 */
export async function listOpenTodos(
  db: Db,
  userId: string,
  opts: { doneSince?: Date } = {},
) {
  const open = eq(todos.completed, false);
  return db
    .select({
      id: todos.id,
      title: todos.title,
      completed: todos.completed,
      position: todos.position,
      dueDate: todos.dueDate,
      pinned: todos.pinned,
      recurrence: todos.recurrence,
      listId: todos.listId,
      listName: lists.name,
    })
    .from(todos)
    .innerJoin(lists, eq(lists.id, todos.listId))
    .where(
      and(
        eq(todos.userId, userId),
        isNull(todos.parentId),
        opts.doneSince
          ? or(
              open,
              and(
                eq(todos.completed, true),
                gte(todos.updatedAt, opts.doneSince),
              ),
            )
          : open,
      ),
    )
    .orderBy(asc(lists.position), desc(todos.pinned), asc(todos.position));
}

/**
 * The user's lists in display order (system lists first, then custom),
 * trimmed to what the Gmail add-on needs: an id to write `listId` with and a
 * name for the quick-add dropdown / open-todos section headers.
 */
export async function listListsForUser(db: Db, userId: string) {
  return db
    .select({ id: lists.id, name: lists.name, systemKind: lists.systemKind })
    .from(lists)
    .where(eq(lists.userId, userId))
    .orderBy(asc(lists.position));
}

/**
 * Toggle a top-level todo's completed state, applying the same server-canonical
 * rules as the apps' sync (`handlers/sync.ts`):
 *   - a recurring todo being completed rolls its dueDate forward instead of
 *     persisting the completion (completed stays false, completedAt stamped),
 *   - completing a pinned todo unpins it,
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
    const timeZone = await getUserTimezone(db, userId);
    const nextDue = toDueDay(
      nextDueDate(recurrence, existing.dueDate, now, timeZone),
    );
    updates.completed = false;
    updates.completedAt = now;
    updates.dueDate = nextDue;
    // The new occurrence is placed by its due date's distance, per the
    // settled recurrence heuristic — then ages normally afterward.
    const placementListId = await getSystemListId(
      db,
      userId,
      placementForDueDate(nextDue, now, timeZone),
    );
    if (placementListId && placementListId !== existing.listId) {
      updates.listId = placementListId;
      updates.listEnteredAt = now;
    }
  }

  // Completing a pinned todo unpins it — it sorts as an ordinary done todo.
  if (completingRow && existing.pinned) updates.pinned = false;

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
