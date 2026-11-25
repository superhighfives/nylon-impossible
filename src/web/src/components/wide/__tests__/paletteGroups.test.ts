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
    columnList: null,
    toggleColumn: vi.fn(),
    orderList: null,
    moveList: vi.fn(),
    admin: false,
    board: {} as Board,
    goToColumn: vi.fn(),
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

describe("paletteGroups: Hide column", () => {
  const commands = (over: Partial<PaletteSource>) =>
    paletteGroups({ mode: "all" }, undefined, { ...source(), ...over }, "")
      .find((g) => g.label === "Commands")
      ?.items.map((i) => i.label) ?? [];

  it("offers Hide column for your list with the selection", () => {
    const toggleColumn = vi.fn();
    const [group] = paletteGroups(
      { mode: "all" },
      undefined,
      { ...source(), columnList: collections[1], toggleColumn },
      "hide column",
    ).filter((g) => g.items.length > 0);
    expect(group.items.map((i) => i.label)).toEqual(["Hide column “B”"]);
    group.items[0].run();
    expect(toggleColumn).toHaveBeenCalledWith(collections[1]);
  });

  it("never offers it for Today, This week or Someday", () => {
    for (const list of timeLists) {
      expect(
        commands({ columnList: list }).filter((l) => l.startsWith("Hide")),
      ).toEqual([]);
    }
  });

  it("offers Show column for each list you've hidden", () => {
    const hidden = collections.map((l, i) =>
      i === 2 ? { ...l, columnHidden: true } : l,
    );
    expect(
      commands({ collections: hidden }).filter((l) => l.includes("column")),
    ).toEqual(["Show column “C”"]);
  });

  it("still lists a hidden list under Go to", () => {
    const hidden = collections.map((l) => ({ ...l, columnHidden: true }));
    const go = paletteGroups(
      { mode: "lists" },
      undefined,
      { ...source(), collections: hidden },
      "",
    )[0].items.map((i) => i.label);
    expect(go).toEqual([
      "Today",
      "This week",
      "Someday",
      "A",
      "B",
      "C",
      "Done",
    ]);
  });
});

describe("paletteGroups: Move list up and down", () => {
  const items = (over: Partial<PaletteSource>, query = "move list") =>
    paletteGroups({ mode: "all" }, undefined, { ...source(), ...over }, query)
      .find((g) => g.label === "Commands")
      ?.items.filter((i) => i.label.startsWith("Move list")) ?? [];

  it("offers both for a list in the middle, named beside them, with ⌥↑ and ⌥↓", () => {
    const moveList = vi.fn();
    const found = items({ orderList: collections[1], moveList });
    expect(found.map((i) => [i.label, i.meta, i.hint])).toEqual([
      ["Move list up", "B", "⌥↑"],
      ["Move list down", "B", "⌥↓"],
    ]);
    found[0].run();
    expect(moveList).toHaveBeenLastCalledWith(collections[1], -1);
    found[1].run();
    expect(moveList).toHaveBeenLastCalledWith(collections[1], 1);
  });

  it("offers neither past the first or last of your lists", () => {
    expect(items({ orderList: collections[0] }).map((i) => i.label)).toEqual([
      "Move list down",
    ]);
    expect(items({ orderList: collections[2] }).map((i) => i.label)).toEqual([
      "Move list up",
    ]);
  });

  it("offers nothing with no list of yours to move, or for a time list", () => {
    expect(items({ orderList: null })).toEqual([]);
    expect(items({ orderList: timeLists[0] })).toEqual([]);
  });
});
