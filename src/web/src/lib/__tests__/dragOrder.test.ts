import { describe, expect, it } from "vitest";
import {
  byPosition,
  clampToTier,
  dropLineY,
  dropPlacement,
  partOffset,
  positionAt,
  slotAt,
} from "../dragOrder";

const row = (id: string, position: string, pinned = false) => ({
  id,
  position,
  pinned,
});

// Two pinned rows, then three unpinned.
const list = [
  row("p1", "a0", true),
  row("p2", "a1", true),
  row("a", "a0"),
  row("b", "a1"),
  row("c", "a2"),
];

describe("byPosition", () => {
  it("orders mixed-case keys by code point, as D1 and iOS do", () => {
    const keys = ["a0", "a1", "Zz", "Zy", "a0V", "a0k"];
    expect(
      keys
        .map((position) => ({ position }))
        .sort(byPosition)
        .map((r) => r.position),
    ).toEqual(["Zy", "Zz", "a0", "a0V", "a0k", "a1"]);
  });

  it("returns 0 for equal positions", () => {
    expect(byPosition({ position: "a0" }, { position: "a0" })).toBe(0);
  });
});

describe("clampToTier", () => {
  it("keeps an unpinned row out of the pinned tier", () => {
    expect(clampToTier(list, false, 0)).toBe(2);
    expect(clampToTier(list, false, 4)).toBe(4);
    expect(clampToTier(list, false, 99)).toBe(5);
  });

  it("keeps a pinned row within the pinned tier", () => {
    expect(clampToTier(list, true, 4)).toBe(2);
    expect(clampToTier(list, true, 1)).toBe(1);
    expect(clampToTier(list, true, -3)).toBe(0);
  });
});

describe("positionAt", () => {
  it("sorts between same-tier neighbours", () => {
    const items = [...list.slice(0, 3), row("x", "zz"), ...list.slice(3)]; // between a and b
    const pos = positionAt(items, 3);
    expect(pos > "a0" && pos < "a1").toBe(true);
  });

  it("ignores a neighbour across the tier boundary", () => {
    const items = [...list.slice(0, 2), row("x", "zz"), ...list.slice(2)]; // top of unpinned
    const pos = positionAt(items, 2);
    expect(pos < "a0").toBe(true);
  });

  it("works for the only row in a list", () => {
    expect(typeof positionAt([row("x", "zz")], 0)).toBe("string");
  });

  it("doesn't throw on duplicate neighbour positions", () => {
    const items = [row("a", "a1"), row("x", "zz"), row("b", "a1")];
    expect(() => positionAt(items, 1)).not.toThrow();
  });
});

describe("slotAt", () => {
  it("points before the first row whose middle is below the pointer", () => {
    const mids = [10, 30, 50];
    expect(slotAt(mids, 0)).toBe(0);
    expect(slotAt(mids, 20)).toBe(1);
    expect(slotAt(mids, 49)).toBe(2);
    expect(slotAt(mids, 99)).toBe(3);
    expect(slotAt([], 5)).toBe(0);
  });
});

describe("dropPlacement", () => {
  const list = [row("p", "a0", true), row("a", "a1"), row("b", "a2")];

  it("lands between its new neighbours", () => {
    const { index, position } = dropPlacement(list, row("x", "a9"), 2);
    expect(index).toBe(2);
    expect(position > "a1" && position < "a2").toBe(true);
  });

  it("keeps an unpinned todo below the pinned ones", () => {
    expect(dropPlacement(list, row("x", "a9"), 0).index).toBe(1);
  });

  it("counts slots without the todo itself when reordering", () => {
    const { index, position } = dropPlacement(list, list[1], 2);
    expect(index).toBe(2);
    expect(position > "a2").toBe(true);
  });
});

describe("dropLineY", () => {
  // Rows touching, as on the board: 40px, 40px, a three-line 88px row, 40px.
  const rows = [
    { top: 0, bottom: 40 },
    { top: 40, bottom: 80 },
    { top: 80, bottom: 168 },
    { top: 168, bottom: 208 },
  ];
  const inside = (y: number) => rows.some((r) => y > r.top && y < r.bottom);

  it("marks the boundary each slot lands between, never inside a row", () => {
    expect(dropLineY(rows, 0, -1, 0)).toBe(0); // above the first row
    expect(dropLineY(rows, 1, -1, 0)).toBe(40);
    expect(dropLineY(rows, 2, -1, 0)).toBe(80); // above the three-line row
    expect(dropLineY(rows, 3, -1, 0)).toBe(168); // below it
    expect(dropLineY(rows, 4, -1, 0)).toBe(208); // below the last row
    for (let slot = 0; slot <= rows.length; slot++) {
      expect(inside(dropLineY(rows, slot, -1, 0) as number)).toBe(false);
    }
  });

  it("centres the line in a gap between rows", () => {
    const gapped = [
      { top: 0, bottom: 40 },
      { top: 50, bottom: 90 },
    ];
    expect(dropLineY(gapped, 1, -1, 0)).toBe(45);
  });

  it("skips over the dragged row's space for the other slots", () => {
    // Dragging row 1: the others are rows 0, 2 and 3.
    expect(dropLineY(rows, 0, 1, 0)).toBe(0);
    expect(dropLineY(rows, 2, 1, 0)).toBe(168); // between rows 2 and 3
    expect(dropLineY(rows, 3, 1, 0)).toBe(208);
  });

  it("puts its own slot at the dragged row's nearer edge", () => {
    expect(dropLineY(rows, 1, 1, 45)).toBe(40);
    expect(dropLineY(rows, 1, 1, 75)).toBe(80);
  });

  it("marks the pinned tier's boundary when the slot is clamped", () => {
    // Two pinned rows, then two unpinned; an unpinned todo from another
    // column dragged up over the pinned ones lands below them.
    const items = [
      row("p1", "a0", true),
      row("p2", "a1", true),
      row("a", "a0"),
      row("b", "a1"),
    ];
    const mids = rows.map((r) => (r.top + r.bottom) / 2);
    const { index } = dropPlacement(items, row("x", "a9"), slotAt(mids, 5));
    expect(index).toBe(2);
    expect(dropLineY(rows, index, -1, 5)).toBe(80);
  });

  it("has nowhere to go in an empty column", () => {
    expect(dropLineY([], 0, -1, 0)).toBeNull();
  });
});

describe("dropping on the dragged row's own faded slot", () => {
  // "b" is dragged and keeps its space, faded, between "a" and "c".
  const items = [row("a", "a0"), row("b", "a1"), row("c", "a2")];
  const rects = [
    { top: 0, bottom: 40 },
    { top: 40, bottom: 80 },
    { top: 80, bottom: 120 },
  ];
  const mids = [20, 100]; // "a" and "c": the dragged row is left out

  it.each([
    [42, 40],
    [60, 40],
    [61, 80],
    [78, 80],
  ])("a pointer at %i shows the line at %i and changes nothing", (y, line) => {
    const slot = slotAt(mids, y);
    const { index, position } = dropPlacement(items, items[1], slot);
    expect(index).toBe(1);
    expect(position).toBe("a1");
    expect(dropLineY(rects, index, 1, y)).toBe(line);
  });
});

describe("parting the rows around a touch drag", () => {
  // Five rows, 40 tall; the one at index 1 is dragged.
  const offsets = (slot: number) =>
    [0, 1, 2, 3, 4].map((i) => partOffset(1, slot, i, 40));

  it("moves nothing while it's over its own slot", () => {
    expect(offsets(1).every((dy) => dy === 0)).toBe(true);
  });

  it("lifts the rows it passes going down", () => {
    expect(offsets(3)).toEqual([0, 0, -40, -40, 0]);
  });

  it("drops the rows it passes going up", () => {
    expect(offsets(0)).toEqual([40, 0, 0, 0, 0]);
  });

  it("parts only within the tier the slot was clamped to", () => {
    // Two pinned rows, then three: a pinned row dragged to the bottom is
    // clamped to slot 1, after the other pinned row.
    const items = [
      row("p1", "a0", true),
      row("p2", "a1", true),
      row("a", "a0"),
      row("b", "a1"),
      row("c", "a2"),
    ];
    const { index } = dropPlacement(items, items[0], 4);
    expect(index).toBe(1);
    expect([0, 1, 2, 3, 4].map((i) => partOffset(0, index, i, 40))).toEqual([
      0, -40, 0, 0, 0,
    ]);
  });
});
