import { listNameInSentence } from "@nylon-impossible/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoWithUrls } from "@/types/database";

const update = vi.fn();
const remove = vi.fn();
const removeList = vi.fn();
vi.mock("@/hooks/useTodos", () => ({
  useUpdateTodo: () => ({
    mutate: update,
    mutateAsync: async (vars: unknown) => update(vars),
  }),
  useDeleteTodo: () => ({ mutate: remove }),
}));
vi.mock("@/hooks/useLists", () => ({
  useDeleteList: () => ({ mutate: removeList }),
}));
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  toast: {
    success: vi.fn(() => "toast-1"),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { toast } from "@/lib/toast";
import { UNDO_HISTORY_LIMIT } from "../undoHistory";
import {
  DONE_COLLAPSE_MS,
  DONE_HOLD_MS,
  UNDO_TOAST_MS,
  useTodoActions,
} from "../useTodoActions";
import { dueIn, makeList, makeTodo, NOW, TZ } from "./fixtures";

const lists = [
  makeList("list-today", "Today", "today"),
  makeList("list-week", "This week", "thisWeek"),
  makeList("list-groceries", "Groceries", null),
  // One of yours, named like a time list: it keeps its capital
  makeList("list-mine", "Today", null),
];

function setup(todos = [makeTodo()]) {
  const byId = (id: string) => lists.find((l) => l.id === id);
  // `allTodos` is a prop, so a test can rerender with a todo deleted.
  return renderHook(
    ({ allTodos }) =>
      useTodoActions({
        timeZone: TZ,
        listName: (id) => byId(id)?.name ?? "List",
        listInSentence: (id) => {
          const list = byId(id);
          return list ? listNameInSentence(list) : "List";
        },
        allTodos,
        lists,
      }),
    { initialProps: { allTodos: todos } },
  );
}

/** Click the action on the most recent toast. */
function clickToastAction() {
  const options = vi.mocked(toast.success).mock.lastCall?.[1];
  const onClick = options?.actionProps?.onClick as () => void;
  act(() => onClick());
}

describe("useTodoActions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    update.mockReset();
    remove.mockReset();
    removeList.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.info).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("done then gone: fill, hold, collapse, then send and toast Done · Undo", () => {
    const todo = makeTodo({ pinned: true, position: "a3" });
    const { result } = setup([todo]);
    act(() => result.current.complete(todo));
    expect(result.current.checked.has(todo.id)).toBe(true);
    expect(update).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(DONE_HOLD_MS));
    expect(result.current.collapsing.has(todo.id)).toBe(true);
    expect(update).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(DONE_COLLAPSE_MS));
    expect(update).toHaveBeenCalledWith({
      id: todo.id,
      input: { completed: true },
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Done",
      expect.objectContaining({ timeout: UNDO_TOAST_MS }),
    );
    expect(result.current.collapsing.has(todo.id)).toBe(false);

    clickToastAction();
    expect(update).toHaveBeenLastCalledWith({
      id: todo.id,
      input: { completed: false, position: "a3", pinned: true },
    });
  });

  it("a repeat that stays in its list leaves the list out of the toast", () => {
    const todo = makeTodo({
      listId: "list-week",
      dueDate: dueIn(0),
      recurrence: { frequency: "weekly" },
    });
    const { result } = setup([todo]);
    act(() => result.current.complete(todo));
    act(() => vi.advanceTimersByTime(DONE_HOLD_MS));
    expect(toast.success).toHaveBeenCalledWith(
      "Done · next Oct 25",
      expect.anything(),
    );
  });

  it("checking again during the hold cancels before anything is sent", () => {
    const todo = makeTodo();
    const { result } = setup([todo]);
    act(() => result.current.complete(todo));
    act(() => result.current.complete(todo));
    act(() => vi.advanceTimersByTime(DONE_HOLD_MS + DONE_COLLAPSE_MS));
    expect(update).not.toHaveBeenCalled();
    expect(result.current.checked.size).toBe(0);
  });

  it("a repeating todo toasts when it's next and which list it went to", () => {
    const todo = makeTodo({
      dueDate: dueIn(0),
      recurrence: { frequency: "weekly" },
    });
    const { result } = setup([todo]);
    act(() => result.current.complete(todo));
    act(() => vi.advanceTimersByTime(DONE_HOLD_MS));
    expect(result.current.collapsing.size).toBe(0);
    expect(update).toHaveBeenCalledWith({
      id: todo.id,
      input: { completed: true },
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Done · next Oct 25, in this week",
      expect.anything(),
    );
    clickToastAction();
    expect(update).toHaveBeenLastCalledWith({
      id: todo.id,
      input: {
        completedAt: null,
        dueDate: new Date(dueIn(0)),
        listId: "list-today",
      },
    });
  });

  it("delete hides at once, deletes when the toast expires, and Undo cancels it", () => {
    const todo = makeTodo();
    const { result } = setup([todo]);
    act(() => result.current.destroy(todo));
    expect(result.current.hidden.has(todo.id)).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Deleted", expect.anything());
    clickToastAction();
    expect(result.current.hidden.has(todo.id)).toBe(false);
    act(() => vi.advanceTimersByTime(UNDO_TOAST_MS * 2));
    expect(remove).not.toHaveBeenCalled();

    act(() => result.current.destroy(todo));
    act(() => vi.advanceTimersByTime(UNDO_TOAST_MS));
    expect(remove).toHaveBeenCalledWith(todo.id, expect.anything());
  });

  it("deleting a list hides it, names it and its todos, and Undo brings it back", () => {
    const list = makeList("list-studio", "Studio", null, "a3");
    const todos = [
      makeTodo({ id: "a", listId: "list-studio" }),
      makeTodo({ id: "b", listId: "list-studio", completed: true }),
      makeTodo({ id: "c", listId: "list-studio", parentId: "a" }),
      makeTodo({ id: "d", listId: "list-today" }),
    ];
    const { result } = setup(todos);
    act(() => result.current.destroyList(list));
    expect(result.current.hiddenLists.has("list-studio")).toBe(true);
    expect(toast.success).toHaveBeenCalledWith(
      "Deleted “Studio” and 2 todos",
      expect.anything(),
    );
    clickToastAction();
    expect(result.current.hiddenLists.has("list-studio")).toBe(false);
    act(() => vi.advanceTimersByTime(UNDO_TOAST_MS * 2));
    expect(removeList).not.toHaveBeenCalled();

    act(() => result.current.destroyList(list));
    act(() => vi.advanceTimersByTime(UNDO_TOAST_MS));
    expect(removeList).toHaveBeenCalledWith("list-studio", expect.anything());
  });

  it("Undo after a flushed delete says it's already deleted", () => {
    const todo = makeTodo();
    const { result } = setup([todo]);
    act(() => result.current.destroy(todo));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(remove).toHaveBeenCalledTimes(1);

    clickToastAction();
    expect(toast.info).toHaveBeenCalledWith("Already deleted");
    expect(result.current.hidden.has(todo.id)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("a replaced Deleted toast still commits the delete on schedule", () => {
    const todo = makeTodo();
    const other = makeTodo({ id: "o", position: "a2" });
    const { result } = setup([todo, other]);
    act(() => result.current.destroy(todo));
    act(() => result.current.move(other, "list-week"));
    expect(toast.dismiss).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(UNDO_TOAST_MS));
    expect(remove).toHaveBeenCalledWith(todo.id, expect.anything());
  });

  it("move goes to the top of the new list with an Undo back", () => {
    const todo = makeTodo({ position: "a5" });
    const other = makeTodo({ id: "w", listId: "list-week", position: "a1" });
    const { result } = setup([todo, other]);
    act(() => result.current.move(todo, "list-week"));
    const input = update.mock.lastCall?.[0].input;
    expect(input.listId).toBe("list-week");
    expect(input.position < "a1").toBe(true);
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to this week",
      expect.anything(),
    );
    clickToastAction();
    expect(update).toHaveBeenLastCalledWith({
      id: todo.id,
      input: { listId: "list-today", position: "a5" },
    });
  });

  it("a move to one of your lists names it as written", () => {
    const todo = makeTodo();
    const { result } = setup([todo]);
    act(() => result.current.move(todo, "list-groceries"));
    expect(toast.success).toHaveBeenLastCalledWith(
      "Moved to Groceries",
      expect.anything(),
    );
    act(() => result.current.move(todo, "list-mine"));
    expect(toast.success).toHaveBeenLastCalledWith(
      "Moved to Today",
      expect.anything(),
    );
  });

  it("pin toggles", () => {
    const todo = makeTodo({ pinned: true });
    const { result } = setup([todo]);
    act(() => result.current.togglePin(todo));
    expect(update).toHaveBeenCalledWith({
      id: todo.id,
      input: { pinned: false },
    });
  });

  it("restoring from Done history puts it back in its list", () => {
    const todo = makeTodo({ completed: true });
    const { result } = setup([todo]);
    act(() => result.current.restore(todo));
    expect(update.mock.lastCall?.[0].input.completed).toBe(false);
    expect(toast.success).toHaveBeenCalledWith(
      "Back in today",
      expect.anything(),
    );
  });

  it("restoring to one of your lists named Today keeps its capital", () => {
    const todo = makeTodo({ completed: true, listId: "list-mine" });
    const { result } = setup([todo]);
    act(() => result.current.restore(todo));
    expect(toast.success).toHaveBeenCalledWith(
      "Back in Today",
      expect.anything(),
    );
  });

  it("a pending completion is committed, not dropped, on unmount", () => {
    const todo = makeTodo();
    const { result, unmount } = setup([todo]);
    act(() => result.current.complete(todo));
    unmount();
    // The hold commit runs; its collapse step is scheduled after unmount,
    // so flush that too.
    act(() => vi.advanceTimersByTime(DONE_COLLAPSE_MS));
    expect(update).toHaveBeenCalled();
  });

  describe("history", () => {
    /** Three todos in Today, and a helper to finish one. */
    function three() {
      const todos = [
        makeTodo({ id: "a", position: "a1" }),
        makeTodo({ id: "b", position: "a2" }),
        makeTodo({ id: "c", position: "a3" }),
      ];
      const hook = setup(todos);
      const finish = (todo: TodoWithUrls) => {
        act(() => hook.result.current.complete(todo));
        act(() => vi.advanceTimersByTime(DONE_HOLD_MS + DONE_COLLAPSE_MS));
      };
      return { todos, ...hook, finish };
    }
    const lastInput = () => update.mock.lastCall?.[0];

    it("undoes after its toast has closed, newest first, each with Undone: …", () => {
      const { todos, result, finish } = three();
      finish(todos[0]);
      finish(todos[1]);
      act(() => result.current.move(todos[2], "list-week"));
      act(() => vi.advanceTimersByTime(UNDO_TOAST_MS * 2));

      act(() => {
        result.current.undo();
      });
      expect(lastInput()).toEqual({
        id: "c",
        input: { listId: "list-today", position: "a3" },
      });
      expect(toast.success).toHaveBeenLastCalledWith(
        "Undone: Moved to this week",
        { timeout: UNDO_TOAST_MS },
      );
      act(() => {
        result.current.undo();
      });
      expect(lastInput()).toEqual({
        id: "b",
        input: { completed: false, position: "a2" },
      });
      act(() => {
        result.current.undo();
      });
      expect(lastInput()).toEqual({
        id: "a",
        input: { completed: false, position: "a1" },
      });
      expect(toast.success).toHaveBeenLastCalledWith("Undone: Done", {
        timeout: UNDO_TOAST_MS,
      });

      // Nothing left: does nothing, shows nothing.
      update.mockClear();
      vi.mocked(toast.success).mockClear();
      let did = true;
      act(() => {
        did = result.current.undo();
      });
      expect(did).toBe(false);
      expect(update).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("redo re-applies what was undone, newest undone first, with Redone: …", () => {
      const { todos, result, finish } = three();
      finish(todos[0]);
      finish(todos[1]);
      act(() => {
        result.current.undo();
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });
      expect(lastInput()).toEqual({ id: "a", input: { completed: true } });
      expect(toast.success).toHaveBeenLastCalledWith("Redone: Done", {
        timeout: UNDO_TOAST_MS,
      });
      act(() => {
        result.current.redo();
      });
      expect(lastInput()).toEqual({ id: "b", input: { completed: true } });

      // A redone move goes to the top of its list again.
      act(() => result.current.move(todos[2], "list-week"));
      act(() => {
        result.current.undo();
        result.current.redo();
      });
      expect(lastInput()).toEqual({
        id: "c",
        input: expect.objectContaining({ listId: "list-week" }),
      });
      expect(toast.success).toHaveBeenLastCalledWith(
        "Redone: Moved to this week",
        { timeout: UNDO_TOAST_MS },
      );
    });

    it("a new history action clears redo; a pin doesn't", () => {
      const { todos, result, finish } = three();
      finish(todos[0]);
      act(() => {
        result.current.undo();
      });
      act(() => result.current.togglePin(todos[1]));
      update.mockClear();
      act(() => {
        result.current.redo();
      });
      expect(lastInput()).toEqual({ id: "a", input: { completed: true } });

      act(() => {
        result.current.undo();
      });
      finish(todos[1]);
      update.mockClear();
      let did = true;
      act(() => {
        did = result.current.redo();
      });
      expect(did).toBe(false);
      expect(update).not.toHaveBeenCalled();
    });

    it("the toast's Undo is an undo from the history: redoable, no extra toast", () => {
      const { todos, result, finish } = three();
      finish(todos[0]);
      const toasts = vi.mocked(toast.success).mock.calls.length;
      clickToastAction();
      expect(lastInput()).toEqual({
        id: "a",
        input: { completed: false, position: "a1" },
      });
      expect(toast.success).toHaveBeenCalledTimes(toasts);
      act(() => {
        result.current.redo();
      });
      expect(lastInput()).toEqual({ id: "a", input: { completed: true } });
    });

    it("a delete is sent when its 5s are up and leaves the history", () => {
      const { todos, result, finish } = three();
      finish(todos[0]);
      act(() => result.current.destroy(todos[1]));
      act(() => vi.advanceTimersByTime(UNDO_TOAST_MS));
      expect(remove).toHaveBeenCalledWith("b", expect.anything());

      // `z` skips the sent delete to the Done before it.
      act(() => {
        result.current.undo();
      });
      expect(lastInput()).toEqual({
        id: "a",
        input: { completed: false, position: "a1" },
      });
      expect(result.current.hidden.has("b")).toBe(true);
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("a delete is still sent on time after newer actions", () => {
      const { todos, result, finish } = three();
      act(() => result.current.destroy(todos[0]));
      finish(todos[1]);
      act(() => result.current.move(todos[2], "list-week"));
      act(() => vi.advanceTimersByTime(UNDO_TOAST_MS));
      expect(remove).toHaveBeenCalledWith("a", expect.anything());
    });

    it("undoing an unsent delete un-hides it; redoing hides it and sends it 5s later", () => {
      const { todos, result } = three();
      act(() => result.current.destroy(todos[0]));
      act(() => vi.advanceTimersByTime(UNDO_TOAST_MS - 1000));
      act(() => {
        result.current.undo();
      });
      expect(result.current.hidden.has("a")).toBe(false);
      expect(toast.success).toHaveBeenLastCalledWith("Undone: Deleted", {
        timeout: UNDO_TOAST_MS,
      });
      act(() => vi.advanceTimersByTime(UNDO_TOAST_MS * 2));
      expect(remove).not.toHaveBeenCalled();

      act(() => {
        result.current.redo();
      });
      expect(result.current.hidden.has("a")).toBe(true);
      expect(toast.success).toHaveBeenLastCalledWith("Redone: Deleted", {
        timeout: UNDO_TOAST_MS,
      });
      act(() => vi.advanceTimersByTime(UNDO_TOAST_MS - 1));
      expect(remove).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(remove).toHaveBeenCalledWith("a", expect.anything());

      // Sent: out of the history.
      let did = true;
      act(() => {
        did = result.current.undo();
      });
      expect(did).toBe(false);
    });

    it("undoing and redoing a list delete reuses its own toast text", () => {
      const { result } = setup([
        makeTodo({ id: "g", listId: "list-groceries" }),
      ]);
      const groceries = lists[2];
      act(() => result.current.destroyList(groceries));
      act(() => {
        result.current.undo();
      });
      expect(result.current.hiddenLists.has("list-groceries")).toBe(false);
      expect(toast.success).toHaveBeenLastCalledWith(
        "Undone: Deleted “Groceries” and 1 todo",
        { timeout: UNDO_TOAST_MS },
      );
      act(() => {
        result.current.redo();
      });
      expect(result.current.hiddenLists.has("list-groceries")).toBe(true);
      act(() => vi.advanceTimersByTime(UNDO_TOAST_MS));
      expect(removeList).toHaveBeenCalledWith(
        "list-groceries",
        expect.anything(),
      );
    });

    it("an entry whose todo has since been deleted says Already deleted and is dropped", () => {
      const { todos, result, rerender, finish } = three();
      finish(todos[0]);
      act(() => result.current.move(todos[1], "list-week"));
      // Deleted on another device: gone from the cache.
      rerender({ allTodos: [todos[0], todos[2]] });
      update.mockClear();
      act(() => {
        result.current.undo();
      });
      expect(toast.info).toHaveBeenCalledWith("Already deleted");
      expect(update).not.toHaveBeenCalled();

      // Dropped: the next `z` reaches the Done before it, and there's no
      // redo of the dropped move.
      act(() => {
        result.current.undo();
      });
      expect(lastInput()).toEqual({
        id: "a",
        input: { completed: false, position: "a1" },
      });
      act(() => {
        result.current.redo();
      });
      update.mockClear();
      let did = true;
      act(() => {
        did = result.current.redo();
      });
      expect(did).toBe(false);
    });

    it(`holds ${UNDO_HISTORY_LIMIT}; a 21st action drops the oldest`, () => {
      const todos = Array.from({ length: UNDO_HISTORY_LIMIT + 1 }, (_, i) =>
        makeTodo({ id: `t${i}`, position: `a${i}` }),
      );
      const { result } = setup(todos);
      for (const todo of todos) {
        act(() => result.current.move(todo, "list-week"));
      }
      update.mockClear();
      let count = 0;
      for (;;) {
        let did = false;
        act(() => {
          did = result.current.undo();
        });
        if (!did) break;
        count++;
      }
      expect(count).toBe(UNDO_HISTORY_LIMIT);
      expect(update.mock.calls.map((c) => c[0].id)).not.toContain("t0");
      expect(update.mock.lastCall?.[0].id).toBe("t1");
    });
  });
});
