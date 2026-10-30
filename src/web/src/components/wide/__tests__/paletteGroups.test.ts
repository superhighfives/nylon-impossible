import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeList, makeTodo } from "../../phone/__tests__/fixtures";
import { recordRecentMove } from "../../phone/moveMenu";
import type { Board } from "../commands";
import { type PaletteSource, paletteGroups } from "../paletteGroups";

const timeLists = [
  makeList("list-today", "Today", "today"),
  makeList("list-week", "This week", "thisWeek"),
  makeList("list-someday", "Someday", "someday"),
];
const collections = ["A", "B", "C"].map((name, i) =>
  makeList(`list-${name.toLowerCase()}`, name, null, `a${i}`),
);

function source(): PaletteSource {
  return {
    timeLists,
    collections,
    countFor: () => 0,
    doneCount: 0,
    todos: [],
    searchable: () => true,
    listName: () => "",
    selected: null,
    admin: false,
    board: {} as Board,
    goToColumn: vi.fn(),
    openList: vi.fn(),
    showDone: vi.fn(),
    goToTodo: vi.fn(),
    moveTodo: vi.fn(),
    moveToNewList: vi.fn(),
  };
}

const moveLabels = () => {
  const todo = makeTodo({ id: "t", listId: "list-today" });
  const [group] = paletteGroups(
    { mode: "move", todoId: "t" },
    todo,
    source(),
    "",
  );
  return group?.items.map((i) => i.label);
};

describe("paletteGroups: Move to", () => {
  beforeEach(() => window.localStorage.clear());

  it("lists the other time lists, then your lists in order", () => {
    expect(moveLabels()).toEqual(["This week", "Someday", "A", "B", "C"]);
  });

  it("puts the lists you moved to most recently first among yours", () => {
    recordRecentMove("list-c");
    expect(moveLabels()).toEqual(["This week", "Someday", "C", "A", "B"]);
  });
});
