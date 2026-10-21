import { toDueDay } from "@nylon-impossible/shared";
import {
  nextDueDate,
  placementForDueDate,
} from "@nylon-impossible/shared/recurrence";
import { generateKeyBetween } from "fractional-indexing";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDeleteTodo, useUpdateTodo } from "@/hooks/useTodos";
import { toast } from "@/lib/toast";
import type { TodoWithUrls, UpdateTodoInput } from "@/types/database";
import { dueLabel } from "./model";

/** How long a checked row holds, filled, before it collapses. */
export const DONE_HOLD_MS = 400;
/** Matches the row's collapse transition (`--n-duration-base`). */
export const DONE_COLLAPSE_MS = 220;
/** How long "Done · Undo" (and the other undo toasts) stay up. */
export const UNDO_TOAST_MS = 5000;

type Timer = ReturnType<typeof setTimeout>;

const PLACEMENT_NAMES = {
  today: "Today",
  thisWeek: "This Week",
  someday: "Someday",
} as const;

/**
 * One toast at a time on the phone: a new one replaces whatever's showing,
 * so its action is always the one on screen. The action closes the toast.
 */
export function showActionToast(
  text: string,
  label: string,
  run: () => void,
  timeout = UNDO_TOAST_MS,
) {
  toast.dismiss();
  const id = toast.success(text, {
    timeout,
    actionProps: {
      children: label,
      onClick: () => {
        toast.dismiss(id);
        run();
      },
    },
  });
  return id;
}

/** "Done · Undo", "Moved to This Week · Undo", "Deleted · Undo" … */
export function showUndoToast(text: string, undo: () => void) {
  return showActionToast(text, "Undo", undo);
}

function withId(set: ReadonlySet<string>, id: string, on: boolean) {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/**
 * Everything a phone row can do to a todo, with the timing the spec asks for:
 *
 * - **Done then gone**: the checkbox fills, the row holds ~400ms, collapses,
 *   then the completion is sent and "Done · Undo" shows for 5s. A repeating
 *   todo's due day rolls forward and the server re-places it by that date, so
 *   the toast says when it's next and, if it left, which list it went to.
 *   Checking again during the hold cancels before anything is sent.
 * - **Delete** hides the row at once and only deletes when the Undo toast
 *   expires, so Undo needs no re-create. The delete commits on that schedule
 *   even if a later toast replaces this one (one toast at a time). Undo after
 *   the delete was already sent says "Already deleted".
 * - **Move** and **Pin** are instant, with Undo for moves.
 *
 * Pending timers are flushed (committed) on unmount and when the page is
 * hidden, so leaving the app mid-hold never drops a completion or delete.
 */
export function useTodoActions({
  timeZone,
  listName,
  allTodos,
}: {
  timeZone: string;
  listName: (listId: string) => string;
  allTodos: TodoWithUrls[];
}) {
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [collapsing, setCollapsing] = useState<ReadonlySet<string>>(new Set());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(
    new Map<string, { timer: Timer; commit: () => void }>(),
  );
  const todosRef = useRef(allTodos);
  todosRef.current = allTodos;

  const update = updateTodo.mutate;
  const remove = deleteTodo.mutate;

  const schedule = useCallback(
    (key: string, delay: number, commit: () => void) => {
      const timer = setTimeout(() => {
        pending.current.delete(key);
        commit();
      }, delay);
      pending.current.set(key, { timer, commit });
    },
    [],
  );

  const cancel = useCallback((key: string) => {
    const entry = pending.current.get(key);
    if (!entry) return false;
    clearTimeout(entry.timer);
    pending.current.delete(key);
    return true;
  }, []);

  useEffect(() => {
    const flush = () => {
      for (const { timer, commit } of pending.current.values()) {
        clearTimeout(timer);
        commit();
      }
      pending.current.clear();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /** Top of a list's open rows — where moved and restored todos land. */
  const topPosition = useCallback((listId: string) => {
    const min = todosRef.current
      .filter((t) => t.listId === listId && t.parentId == null && !t.completed)
      .reduce<string | null>(
        (lo, t) => (lo === null || t.position < lo ? t.position : lo),
        null,
      );
    return generateKeyBetween(null, min);
  }, []);

  const complete = useCallback(
    (todo: TodoWithUrls) => {
      const key = `done:${todo.id}`;
      // A second press during the hold is an undo before anything was sent.
      if (cancel(key) || cancel(`${key}:collapse`)) {
        setChecked((s) => withId(s, todo.id, false));
        setCollapsing((s) => withId(s, todo.id, false));
        return;
      }
      setChecked((s) => withId(s, todo.id, true));
      const repeats = !!todo.recurrence && !!todo.dueDate;

      if (repeats) {
        schedule(key, DONE_HOLD_MS, () => {
          setChecked((s) => withId(s, todo.id, false));
          update({ id: todo.id, input: { completed: true } });
          const now = new Date();
          const next = toDueDay(
            nextDueDate(
              // biome-ignore lint/style/noNonNullAssertion: `repeats` checked both
              todo.recurrence!,
              // biome-ignore lint/style/noNonNullAssertion: `repeats` checked both
              new Date(todo.dueDate!),
              now,
              timeZone,
            ),
          );
          const undo: UpdateTodoInput = {
            completedAt: null,
            // biome-ignore lint/style/noNonNullAssertion: `repeats` checked both
            dueDate: new Date(todo.dueDate!),
            listId: todo.listId,
          };
          if (todo.pinned) undo.pinned = true;
          // The server places the next occurrence by its due date, so the
          // row may leave this list. Say where it went when it does.
          const nextList =
            PLACEMENT_NAMES[placementForDueDate(next, now, timeZone)];
          const where =
            nextList === listName(todo.listId) ? "" : `, in ${nextList}`;
          showUndoToast(
            `Done · next ${dueLabel(next, now, timeZone).text}${where}`,
            () => update({ id: todo.id, input: undo }),
          );
        });
        return;
      }

      schedule(key, DONE_HOLD_MS, () => {
        setCollapsing((s) => withId(s, todo.id, true));
        schedule(`${key}:collapse`, DONE_COLLAPSE_MS, () => {
          update({ id: todo.id, input: { completed: true } });
          setChecked((s) => withId(s, todo.id, false));
          setCollapsing((s) => withId(s, todo.id, false));
          const undo: UpdateTodoInput = {
            completed: false,
            position: todo.position,
          };
          if (todo.pinned) undo.pinned = true;
          showUndoToast("Done", () => update({ id: todo.id, input: undo }));
        });
      });
    },
    [cancel, listName, schedule, timeZone, update],
  );

  const move = useCallback(
    (todo: TodoWithUrls, listId: string, { quiet = false } = {}) => {
      if (todo.listId === listId) return;
      const from = { listId: todo.listId, position: todo.position };
      update({
        id: todo.id,
        input: { listId, position: topPosition(listId) },
      });
      // The detail sheet shows the new list on its chip; no toast needed.
      if (quiet) return;
      showUndoToast(`Moved to ${listName(listId)}`, () =>
        update({ id: todo.id, input: from }),
      );
    },
    [listName, topPosition, update],
  );

  const togglePin = useCallback(
    (todo: TodoWithUrls) => {
      update({ id: todo.id, input: { pinned: !todo.pinned } });
    },
    [update],
  );

  const destroy = useCallback(
    (todo: TodoWithUrls) => {
      const key = `delete:${todo.id}`;
      setHidden((s) => withId(s, todo.id, true));
      schedule(key, UNDO_TOAST_MS, () => {
        remove(todo.id, {
          onSettled: () => setHidden((s) => withId(s, todo.id, false)),
        });
      });
      showUndoToast("Deleted", () => {
        // Hiding the page flushes pending work, so the delete may already be
        // sent while this toast is still on screen. Say so, rather than
        // un-hiding a row that's gone.
        if (!cancel(key)) {
          toast.info("Already deleted");
          return;
        }
        setHidden((s) => withId(s, todo.id, false));
      });
    },
    [cancel, remove, schedule],
  );

  /** Done history: put a todo back in the list it was finished from. */
  const restore = useCallback(
    (todo: TodoWithUrls) => {
      update({
        id: todo.id,
        input: { completed: false, position: topPosition(todo.listId) },
      });
      showUndoToast(`Back in ${listName(todo.listId)}`, () =>
        update({ id: todo.id, input: { completed: true } }),
      );
    },
    [listName, topPosition, update],
  );

  /**
   * Drag-and-drop: put a todo at an exact slot, in its own list or another.
   * The drop itself is the feedback, so there's no toast.
   */
  const place = useCallback(
    (todo: TodoWithUrls, listId: string, position: string) => {
      if (todo.listId === listId && todo.position === position) return;
      update({
        id: todo.id,
        input: todo.listId === listId ? { position } : { listId, position },
      });
    },
    [update],
  );

  /** Due… in the context menu. Clearing the day clears Repeat too. */
  const setDue = useCallback(
    (todo: TodoWithUrls, day: Date | null) => {
      update({
        id: todo.id,
        input: day ? { dueDate: day } : { dueDate: null, recurrence: null },
      });
    },
    [update],
  );

  /** Detail-sheet edits: saved the moment they're made. */
  const save = useCallback(
    (id: string, input: UpdateTodoInput) => update({ id, input }),
    [update],
  );

  return {
    checked,
    collapsing,
    hidden,
    complete,
    move,
    place,
    setDue,
    togglePin,
    destroy,
    restore,
    save,
  };
}

export type TodoActions = ReturnType<typeof useTodoActions>;
