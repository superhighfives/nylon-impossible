import { afterEach, describe, expect, it, vi } from "vitest";
import { holdLeavingSheet, type Placed, slideColumns } from "../slide";

const TIMING = { duration: 220, easing: "ease-out" };

/** A board row of children at `lefts`, named by `data-slide`. */
function row(lefts: Record<string, number>) {
  const board = document.createElement("main");
  board.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
  for (const key of Object.keys(lefts)) {
    const el = document.createElement("section");
    el.dataset.slide = key;
    Object.defineProperty(el, "offsetLeft", {
      configurable: true,
      get: () => lefts[key],
    });
    // Drawn where it's laid out: nothing in flight.
    el.getBoundingClientRect = () => ({ left: lefts[key] }) as DOMRect;
    el.animate = vi.fn();
    el.getAnimations = () => [];
    board.appendChild(el);
  }
  document.body.appendChild(board);
  return board;
}
const child = (board: HTMLElement, key: string) =>
  board.querySelector<HTMLElement>(`[data-slide="${key}"]`) as HTMLElement;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("slideColumns", () => {
  it("slides each column that moved from where it was, and only those", () => {
    const lefts = { today: 0, groceries: 272, done: 544 };
    const board = row(lefts);
    const placed: Placed = new Map();
    slideColumns(board, placed, TIMING);
    // The first pass only records.
    expect(child(board, "done").animate).not.toHaveBeenCalled();

    // A sheet opened after Today: the columns after it moved right.
    lefts.groceries = 624;
    lefts.done = 896;
    slideColumns(board, placed, TIMING);
    expect(child(board, "today").animate).not.toHaveBeenCalled();
    expect(child(board, "groceries").animate).toHaveBeenCalledWith(
      [{ transform: "translateX(-352px)" }, { transform: "none" }],
      expect.objectContaining(TIMING),
    );
    expect(child(board, "done").animate).toHaveBeenCalledWith(
      [{ transform: "translateX(-352px)" }, { transform: "none" }],
      expect.objectContaining(TIMING),
    );
  });

  it("jumps with reduced motion, but still records where things are", () => {
    const lefts = { today: 0, done: 272 };
    const board = row(lefts);
    const placed: Placed = new Map();
    slideColumns(board, placed, null);
    lefts.done = 624;
    slideColumns(board, placed, null);
    expect(child(board, "done").animate).not.toHaveBeenCalled();
    expect(placed.get("done")).toBe(624);
  });

  it("forgets a column that's gone", () => {
    const board = row({ today: 0, studio: 272 });
    const placed: Placed = new Map();
    slideColumns(board, placed, TIMING);
    child(board, "studio").remove();
    slideColumns(board, placed, TIMING);
    expect([...placed.keys()]).toEqual(["today"]);
  });
});

describe("holdLeavingSheet", () => {
  it("takes a leaving sheet out of the row where it lies, and puts it back", () => {
    const board = row({ sheet: 224 });
    const sheet = child(board, "sheet");
    holdLeavingSheet(sheet, true);
    expect(sheet.style.position).toBe("absolute");
    expect(sheet.style.left).toBe("224px");
    holdLeavingSheet(sheet, false);
    expect(sheet.style.position).toBe("");
    expect(sheet.style.left).toBe("");
  });
});
