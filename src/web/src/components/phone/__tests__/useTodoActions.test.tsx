import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
const remove = vi.fn();
const removeList = vi.fn();
vi.mock("@/hooks/useTodos", () => ({
  useUpdateTodo: () => ({ mutate: update }),
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
import {
  DONE_COLLAPSE_MS,
  DONE_HOLD_MS,
  UNDO_TOAST_MS,
  useTodoActions,
} from "../useTodoActions";
import { dueIn, makeList, makeTodo, NOW, TZ } from "./fixtures";

const names: Record<string, string> = {
  "list-today": "Today",
  "list-week": "This week",
};

function setup(todos = [makeTodo()]) {
  return renderHook(() =>
    useTodoActions({
      timeZone: TZ,
      listName: (id) => names[id] ?? "List",
      allTodos: todos,
    }),
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
      "Done · next Oct 25, in This week",
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
      "Moved to This week",
      expect.anything(),
    );
    clickToastAction();
    expect(update).toHaveBeenLastCalledWith({
      id: todo.id,
      input: { listId: "list-today", position: "a5" },
    });
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
});
