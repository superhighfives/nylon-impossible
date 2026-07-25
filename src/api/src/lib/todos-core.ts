import { nextDueDate } from "@nylon-impossible/shared/recurrence";
import type { Env } from "../types";
import { and, asc, eq, type getDb, isNull, todoMessages, todos } from "./db";
import { notifySync } from "./notify-sync";

type Db = ReturnType<typeof getDb>;
type Bindings = Env["Bindings"];

/**
 * The user's open, top-level todos in list order. Shared by the Gmail add-on
 * homepage card and any REST surface that needs the same "what's on my plate"
 * view, so the two can't drift. Excludes completed todos and subtasks
 * (parentId IS NULL), matching the top-level list shown on web/iOS.
 */
export function listOpenTodos(db: Db, userId: string) {
  return db
    .select({
      id: todos.id,
      title: todos.title,
      position: todos.position,
      dueDate: todos.dueDate,
      priority: todos.priority,
    })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        isNull(todos.parentId),
        eq(todos.completed, false),
      ),
    )
    .orderBy(asc(todos.position));
}

/**
 * Toggle a top-level todo's completed state, applying the same server-canonical
 * rules as the REST `updateTodo` handler:
 *   - a recurring todo being completed rolls its dueDate forward instead of
 *     persisting the completion (completed stays false, completedAt stamped),
 *   - completing a todo with an open question clears needsInput + awaitingReply,
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
    updates.completed = false;
    updates.completedAt = now;
    updates.dueDate = nextDueDate(recurrence, existing.dueDate, now);
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
