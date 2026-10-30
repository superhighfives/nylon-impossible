import { beforeEach, describe, expect, it } from "vitest";
import {
  type MoveTarget,
  moveArrow,
  moveMenuPlan,
  readRecentMoves,
  recordRecentMove,
} from "../moveMenu";

const today: MoveTarget = { id: "today", label: "Today", kind: "today" };
const week: MoveTarget = { id: "week", label: "This week", kind: "thisWeek" };
const someday: MoveTarget = {
  id: "someday",
  label: "Someday",
  kind: "someday",
};
const list = (id: string): MoveTarget => ({ id, label: id, kind: null });
const [a, b, c, d] = ["a", "b", "c", "d"].map(list);

describe("moveArrow", () => {
  it("points the way the lists lie, and right from your lists", () => {
    expect(moveArrow(today, "thisWeek")).toBe("left");
    expect(moveArrow(someday, "thisWeek")).toBe("right");
    expect(moveArrow(week, "today")).toBe("right");
    expect(moveArrow(week, "someday")).toBe("left");
    expect(moveArrow(today, null)).toBe("right");
    expect(moveArrow(a, "someday")).toBe("right");
  });
});

describe("moveMenuPlan", () => {
  it("leads with the two most recent lists, the rest go under More", () => {
    const plan = moveMenuPlan(
      [today, someday, a, b, c, d],
      ["D", "x", "b", "c"],
    );
    expect(plan.timeLists).toEqual([today, someday]);
    expect(plan.recent.map((l) => l.id)).toEqual(["d", "b"]);
    expect(plan.more.map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("fills in from the top of your lists without history", () => {
    const plan = moveMenuPlan([today, a, b, c], []);
    expect(plan.recent.map((l) => l.id)).toEqual(["a", "b"]);
    expect(plan.more.map((l) => l.id)).toEqual(["c"]);
    expect(moveMenuPlan([today, a], []).more).toEqual([]);
  });
});

describe("recent moves", () => {
  beforeEach(() => window.localStorage.clear());

  it("puts the latest first and keeps one copy", () => {
    recordRecentMove("a");
    recordRecentMove("b");
    recordRecentMove("A");
    expect(readRecentMoves()).toEqual(["A", "b"]);
  });

  it("reads nothing when storage holds something else", () => {
    window.localStorage.setItem("nylon:recent-move-lists", "{oops");
    expect(readRecentMoves()).toEqual([]);
  });
});
