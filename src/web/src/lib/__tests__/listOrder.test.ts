import { describe, expect, it } from "vitest";
import { byPosition } from "../dragOrder";
import { applyMoves, listMoves, stepMoves } from "../listOrder";

const lists = (...positions: string[]) =>
  positions.map((position, i) => ({ id: `l${i}`, position }));

/** The ids in the order `moves` leave them. */
const orderAfter = (
  before: { id: string; position: string }[],
  moves: { id: string; position: string }[],
) => [...applyMoves(before, moves)].sort(byPosition).map((l) => l.id);

describe("listMoves", () => {
  const four = lists("a0", "a1", "a2", "a3");

  it("moves a list to the first place, before the old first", () => {
    const moves = listMoves(four, "l3", 0);
    expect(moves).toHaveLength(1);
    expect(moves[0].id).toBe("l3");
    expect(moves[0].position < "a0").toBe(true);
    expect(orderAfter(four, moves)).toEqual(["l3", "l0", "l1", "l2"]);
  });

  it("moves a list between its new neighbours", () => {
    const moves = listMoves(four, "l0", 2);
    expect(moves).toHaveLength(1);
    expect(moves[0].position > "a2" && moves[0].position < "a3").toBe(true);
    expect(orderAfter(four, moves)).toEqual(["l1", "l2", "l0", "l3"]);
  });

  it("moves a list to the last place, after the old last", () => {
    const moves = listMoves(four, "l1", 3);
    expect(moves).toHaveLength(1);
    expect(moves[0].position > "a3").toBe(true);
    expect(orderAfter(four, moves)).toEqual(["l0", "l2", "l3", "l1"]);
  });

  it("saves nothing when the list is already there, or isn't yours", () => {
    expect(listMoves(four, "l2", 2)).toEqual([]);
    expect(listMoves(four, "nope", 0)).toEqual([]);
  });

  it("numbers every list afresh when its new neighbours are tied", () => {
    const tied = lists("a0", "a0", "a0");
    const moves = listMoves(tied, "l2", 1);
    expect(moves.length).toBeGreaterThan(1);
    expect(orderAfter(tied, moves)).toEqual(["l0", "l2", "l1"]);
  });
});

describe("stepMoves", () => {
  const three = lists("a0", "a1", "a2");

  it("moves a list one place up or down", () => {
    expect(orderAfter(three, stepMoves(three, "l1", -1))).toEqual([
      "l1",
      "l0",
      "l2",
    ]);
    expect(orderAfter(three, stepMoves(three, "l1", 1))).toEqual([
      "l0",
      "l2",
      "l1",
    ]);
  });

  it("does nothing past the first or last", () => {
    expect(stepMoves(three, "l0", -1)).toEqual([]);
    expect(stepMoves(three, "l2", 1)).toEqual([]);
  });
});
