import { describe, expect, it } from "vitest";
import {
  clampToTier,
  dropPlacement,
  insertInTier,
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

describe("insertInTier", () => {
  it("inserts at the requested slot when it's in the row's tier", () => {
    const next = insertInTier(list, row("x", "zz"), 3);
    expect(next.map((t) => t.id)).toEqual(["p1", "p2", "a", "x", "b", "c"]);
  });

  it("pushes an unpinned row below the pinned ones", () => {
    const next = insertInTier(list, row("x", "zz"), 0);
    expect(next.map((t) => t.id)).toEqual(["p1", "p2", "x", "a", "b", "c"]);
  });

  it("lands in an empty list", () => {
    expect(insertInTier([], row("x", "a0"), 3).map((t) => t.id)).toEqual(["x"]);
  });
});

describe("positionAt", () => {
  it("sorts between same-tier neighbours", () => {
    const items = insertInTier(list, row("x", "zz"), 3); // between a and b
    const pos = positionAt(items, 3);
    expect(pos > "a0" && pos < "a1").toBe(true);
  });

  it("ignores a neighbour across the tier boundary", () => {
    const items = insertInTier(list, row("x", "zz"), 2); // top of unpinned
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
