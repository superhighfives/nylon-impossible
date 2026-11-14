/** How many actions `z` can step back through. */
export const UNDO_HISTORY_LIMIT = 20;

/**
 * One action that offered Undo: Done, Move, Delete, Delete list or Back in.
 * `undo` and `redo` return false when the todo or list it acts on is gone
 * (deleted here, or on another device), so there's nothing left to change.
 */
export interface UndoEntry {
  /** The action's own toast text: "Done", "Moved to this week". */
  text: string;
  undo: () => boolean;
  redo: () => boolean;
}

export type UndoOutcome =
  | { kind: "done"; entry: UndoEntry }
  | { kind: "gone"; entry: UndoEntry }
  | null;

/**
 * The wide board's undo history: the last `limit` actions, newest last, and
 * the ones undone since, ready to redo. In memory only; a reload clears it.
 * A new action clears redo; a delete that has been sent `drop`s out of both.
 */
export function createUndoHistory(limit = UNDO_HISTORY_LIMIT) {
  let past: UndoEntry[] = [];
  let future: UndoEntry[] = [];

  const drop = (entry: UndoEntry) => {
    past = past.filter((e) => e !== entry);
    future = future.filter((e) => e !== entry);
  };

  return {
    push(entry: UndoEntry) {
      past.push(entry);
      if (past.length > limit) past.shift();
      future = [];
    },
    drop,
    /**
     * Reverse `entry` (the toast's own), or the newest one. One that's gone
     * is dropped; one no longer in the history (a sent delete) is "gone".
     */
    undo(entry: UndoEntry | undefined = past.at(-1)): UndoOutcome {
      if (!entry) return null;
      if (!past.includes(entry)) return { kind: "gone", entry };
      past = past.filter((e) => e !== entry);
      if (!entry.undo()) {
        drop(entry);
        return { kind: "gone", entry };
      }
      future.push(entry);
      return { kind: "done", entry };
    },
    /** Re-apply the most recently undone action. */
    redo(): UndoOutcome {
      const entry = future.pop();
      if (!entry) return null;
      if (!entry.redo()) return { kind: "gone", entry };
      past.push(entry);
      if (past.length > limit) past.shift();
      return { kind: "done", entry };
    },
    /** For tests: how many actions each way. */
    get sizes() {
      return { undo: past.length, redo: future.length };
    },
  };
}

export type UndoHistory = ReturnType<typeof createUndoHistory>;
