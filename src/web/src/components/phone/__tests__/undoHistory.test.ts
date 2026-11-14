import { describe, expect, it } from "vitest";
import {
  createUndoHistory,
  UNDO_HISTORY_LIMIT,
  type UndoEntry,
} from "../undoHistory";

/** An entry that logs what's done to it; `gone` makes it fail. */
function entry(text: string, log: string[], gone = { now: false }) {
  return {
    text,
    undo: () => !gone.now && log.push(`undo ${text}`) > 0,
    redo: () => !gone.now && log.push(`redo ${text}`) > 0,
  } satisfies UndoEntry;
}

describe("createUndoHistory", () => {
  it("undoes newest first, one per call, then nothing", () => {
    const log: string[] = [];
    const history = createUndoHistory();
    for (const t of ["a", "b", "c"]) history.push(entry(t, log));
    expect(history.undo()?.entry.text).toBe("c");
    expect(history.undo()?.entry.text).toBe("b");
    expect(history.undo()?.entry.text).toBe("a");
    expect(history.undo()).toBeNull();
    expect(log).toEqual(["undo c", "undo b", "undo a"]);
  });

  it("redoes the most recently undone first, back onto the undo stack", () => {
    const log: string[] = [];
    const history = createUndoHistory();
    for (const t of ["a", "b", "c"]) history.push(entry(t, log));
    history.undo();
    history.undo();
    expect(history.redo()?.entry.text).toBe("b");
    expect(history.redo()?.entry.text).toBe("c");
    expect(history.redo()).toBeNull();
    expect(history.undo()?.entry.text).toBe("c");
    expect(log.slice(2)).toEqual(["redo b", "redo c", "undo c"]);
  });

  it("a new action clears redo", () => {
    const log: string[] = [];
    const history = createUndoHistory();
    history.push(entry("a", log));
    history.push(entry("b", log));
    history.undo();
    history.push(entry("c", log));
    expect(history.redo()).toBeNull();
    expect(history.sizes).toEqual({ undo: 2, redo: 0 });
  });

  it(`holds ${UNDO_HISTORY_LIMIT}; a 21st drops the oldest`, () => {
    const log: string[] = [];
    const history = createUndoHistory();
    for (let i = 1; i <= UNDO_HISTORY_LIMIT + 1; i++) {
      history.push(entry(String(i), log));
    }
    expect(history.sizes.undo).toBe(UNDO_HISTORY_LIMIT);
    const texts: string[] = [];
    for (let o = history.undo(); o; o = history.undo())
      texts.push(o.entry.text);
    expect(texts.at(0)).toBe("21");
    expect(texts.at(-1)).toBe("2");
  });

  it("a dropped entry (a sent delete) is skipped, from both stacks", () => {
    const log: string[] = [];
    const history = createUndoHistory();
    const a = entry("a", log);
    const deleted = entry("deleted", log);
    history.push(a);
    history.push(deleted);
    history.drop(deleted);
    expect(history.undo()?.entry).toBe(a);

    history.push(deleted);
    history.undo();
    history.drop(deleted);
    expect(history.redo()).toBeNull();
  });

  it("an entry whose todo has gone is reported and dropped", () => {
    const log: string[] = [];
    const history = createUndoHistory();
    const gone = { now: false };
    history.push(entry("a", log));
    history.push(entry("b", log, gone));
    gone.now = true;
    expect(history.undo()?.kind).toBe("gone");
    expect(history.undo()).toMatchObject({
      kind: "done",
      entry: { text: "a" },
    });

    // Gone by the time it's redone: also dropped.
    const later = { now: false };
    history.push(entry("c", log, later));
    history.undo();
    later.now = true;
    expect(history.redo()?.kind).toBe("gone");
    expect(history.sizes).toEqual({ undo: 0, redo: 0 });
  });

  it("the toast's own entry, once it has left the history, is gone", () => {
    const log: string[] = [];
    const history = createUndoHistory();
    const deleted = entry("deleted", log);
    history.push(deleted);
    history.drop(deleted);
    expect(history.undo(deleted)?.kind).toBe("gone");
    expect(log).toEqual([]);
  });
});
