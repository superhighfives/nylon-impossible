import { describe, expect, it, vi } from "vitest";
import { makeList } from "@/components/phone/__tests__/fixtures";
import { boardSlots, revealSpan, sheetScrollTarget } from "../board";

// The commands' Undo reaches the server through it; these don't need it.
vi.mock("@/components/phone/useTodoActions", () => ({
  runToastUndo: vi.fn(),
}));

const lists = [
  makeList("today", "Today", "today", "a0"),
  makeList("week", "This week", "thisWeek", "a1"),
  makeList("someday", "Someday", "someday", "a2"),
  makeList("groceries", "Groceries", null, "a3"),
  makeList("studio", "Studio", null, "a4"),
];
const names = (sheetAfter: string | null) =>
  boardSlots(lists, sheetAfter).map((s) =>
    s.kind === "list" ? s.list.id : s.kind,
  );

describe("boardSlots", () => {
  it("is the time lists, every list in order, then Done, with no sheet", () => {
    expect(names(null)).toEqual([
      "today",
      "week",
      "someday",
      "groceries",
      "studio",
      "done",
    ]);
  });

  it("puts the sheet straight after its todo's column, the rest in order", () => {
    expect(names("someday")).toEqual([
      "today",
      "week",
      "someday",
      "sheet",
      "groceries",
      "studio",
      "done",
    ]);
    expect(names("groceries")).toEqual([
      "today",
      "week",
      "someday",
      "groceries",
      "sheet",
      "studio",
      "done",
    ]);
  });

  it("has no sheet for a column that isn't on the board", () => {
    expect(names("gone")).not.toContain("sheet");
  });
});

describe("revealSpan", () => {
  const view = { scrollLeft: 300, width: 600 };

  it("leaves a span that's already in view alone", () => {
    expect(revealSpan(view, { left: 300, right: 900 })).toBe(300);
    expect(revealSpan(view, { left: 400, right: 700 })).toBe(300);
  });

  it("scrolls just far enough to show a span off either side", () => {
    expect(revealSpan(view, { left: 100, right: 372 })).toBe(100);
    expect(revealSpan(view, { left: 1000, right: 1272 })).toBe(672);
  });

  it("shows the start of a span wider than the view", () => {
    expect(revealSpan(view, { left: 1000, right: 2000 })).toBe(1000);
  });
});

describe("sheetScrollTarget", () => {
  // A column at 1088–1360 and its sheet, overlapping it, to 1712.
  const column = { left: 1088, right: 1360 };
  const sheet = { left: 1312, right: 1712 };

  it("doesn't move when the column and sheet both show", () => {
    expect(
      sheetScrollTarget({ scrollLeft: 1000, width: 800 }, column, sheet),
    ).toBe(1000);
  });

  it("scrolls the least that shows the whole column and the whole sheet", () => {
    // Off to the right: the sheet's right edge comes to the view's.
    expect(
      sheetScrollTarget({ scrollLeft: 0, width: 700 }, column, sheet),
    ).toBe(1012);
    // Off to the left: the column's left edge comes to the view's.
    expect(
      sheetScrollTarget({ scrollLeft: 1500, width: 700 }, column, sheet),
    ).toBe(1088);
  });

  it("shows the whole sheet when both don't fit, with what fits of its column", () => {
    expect(
      sheetScrollTarget({ scrollLeft: 0, width: 500 }, column, sheet),
    ).toBe(1212);
    expect(
      sheetScrollTarget({ scrollLeft: 1600, width: 500 }, column, sheet),
    ).toBe(1212);
  });

  it("never scrolls before the board's start", () => {
    expect(
      sheetScrollTarget(
        { scrollLeft: 50, width: 500 },
        { left: 0, right: 272 },
        { left: 224, right: 624 },
      ),
    ).toBe(124);
    expect(
      sheetScrollTarget(
        { scrollLeft: 50, width: 700 },
        { left: 0, right: 272 },
        { left: 224, right: 624 },
      ),
    ).toBe(0);
  });
});
