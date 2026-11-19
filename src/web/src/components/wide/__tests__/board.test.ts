import { describe, expect, it } from "vitest";
import { makeList } from "@/components/phone/__tests__/fixtures";
import { boardSlots, doneGap, revealSpan, sheetScrollTarget } from "../board";

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
  it("is the time lists, every list in order, then the end and Done, with no sheet", () => {
    expect(names(null)).toEqual([
      "today",
      "week",
      "someday",
      "groceries",
      "studio",
      "end",
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
      "end",
      "done",
    ]);
    expect(names("groceries")).toEqual([
      "today",
      "week",
      "someday",
      "groceries",
      "sheet",
      "studio",
      "end",
      "done",
    ]);
  });

  it("leaves out the lists you've hidden, the rest closing up", () => {
    const hidden = lists.map((l) =>
      l.id === "groceries" ? { ...l, columnHidden: true } : l,
    );
    expect(
      boardSlots(hidden, null).map((s) =>
        s.kind === "list" ? s.list.id : s.kind,
      ),
    ).toEqual(["today", "week", "someday", "studio", "end", "done"]);
  });

  it("has no sheet beside a hidden column", () => {
    const hidden = lists.map((l) =>
      l.id === "groceries" ? { ...l, columnHidden: true } : l,
    );
    expect(
      boardSlots(hidden, "groceries").map((s) =>
        s.kind === "list" ? s.list.id : s.kind,
      ),
    ).not.toContain("sheet");
  });

  it("has no sheet for a column that isn't on the board", () => {
    expect(names("gone")).not.toContain("sheet");
  });
});

describe("boardSlots' end", () => {
  it("comes straight before Done, with nothing after Done", () => {
    for (const sheetAfter of [null, "someday", "studio"]) {
      expect(names(sheetAfter).slice(-2)).toEqual(["end", "done"]);
    }
  });
});

describe("doneGap", () => {
  // The report's board: 1488px wide less the sidebar, columns a third of it.
  const board = 1188;
  const column = 396;
  // A sheet is a column wide, less the 24px of its column it lies over.
  const sheet = column - 24;

  it("adds nothing when the time lists fill the board, so Done follows them", () => {
    const gap = doneGap({ board, column, columns: 3, sheet: 0 });
    expect(gap).toBe(0);
    // Done's left edge, at scroll 0, is the board's right edge.
    expect(3 * column + gap).toBe(board);
  });

  it("adds nothing once the columns reach or pass the edge", () => {
    expect(doneGap({ board, column, columns: 4, sheet: 0 })).toBe(0);
    expect(doneGap({ board, column, columns: 5, sheet: 0 })).toBe(0);
    expect(doneGap({ board, column, columns: 3, sheet })).toBe(0);
  });

  it("follows a list hidden, and a sheet opened", () => {
    expect(doneGap({ board, column, columns: 2, sheet: 0 })).toBe(396);
    expect(doneGap({ board, column, columns: 2, sheet })).toBe(24);
    expect(doneGap({ board, column, columns: 1, sheet })).toBe(420);
    // Each case ends exactly at the edge.
    expect(1 * column + sheet + 420).toBe(board);
  });

  it("hatches only a board wider than three columns at their widest", () => {
    // 35rem columns on a 2000px board: the time lists leave 320px.
    expect(doneGap({ board: 2000, column: 560, columns: 3, sheet: 0 })).toBe(
      320,
    );
    // Up to three widest columns, they fill it.
    expect(doneGap({ board: 1680, column: 560, columns: 3, sheet: 0 })).toBe(0);
  });

  it("rounds up, so no fraction of Done shows", () => {
    expect(doneGap({ board: 1189, column: 297.25, columns: 3, sheet: 0 })).toBe(
      298,
    );
    expect(
      doneGap({ board: 1188.5, column: 297.125, columns: 4, sheet: 0 }),
    ).toBe(0);
  });

  it("leaves no sliver when three fractional thirds fall a hair short", () => {
    const third = 1189 / 3;
    expect(3 * third).toBeLessThanOrEqual(1189);
    expect(
      doneGap({ board: 1189, column: third - 1e-9, columns: 3, sheet: 0 }),
    ).toBe(0);
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
