import { describe, expect, it } from "vitest";
import { makeTodo } from "@/components/phone/__tests__/fixtures";
import { resolveDrop } from "../drop";
import { boardKeyAction, isTypingTarget } from "../keys";

describe("boardKeyAction", () => {
  it.each([
    ["j", { type: "row", delta: 1 }],
    ["ArrowDown", { type: "row", delta: 1 }],
    ["k", { type: "row", delta: -1 }],
    ["ArrowUp", { type: "row", delta: -1 }],
    ["l", { type: "column", delta: 1 }],
    ["ArrowRight", { type: "column", delta: 1 }],
    ["h", { type: "column", delta: -1 }],
    ["ArrowLeft", { type: "column", delta: -1 }],
    ["x", { type: "done" }],
    ["1", { type: "move", kind: "today" }],
    ["2", { type: "move", kind: "thisWeek" }],
    ["3", { type: "move", kind: "someday" }],
    ["p", { type: "pin" }],
    ["d", { type: "due" }],
    ["Backspace", { type: "delete" }],
    ["Delete", { type: "delete" }],
    ["n", { type: "new" }],
    ["f", { type: "feedback" }],
    ["?", { type: "shortcuts" }],
  ])("%s", (key, action) => {
    expect(boardKeyAction({ key })).toEqual(action);
  });

  it("leaves modified keys and unmapped keys to the browser", () => {
    expect(boardKeyAction({ key: "x", metaKey: true })).toBeNull();
    expect(boardKeyAction({ key: "1", ctrlKey: true })).toBeNull();
    expect(boardKeyAction({ key: "j", altKey: true })).toBeNull();
    expect(boardKeyAction({ key: "q" })).toBeNull();
    // Enter opens natively: the focused row is a button.
    expect(boardKeyAction({ key: "Enter" })).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("is true in fields, dialogs and menus", () => {
    document.body.innerHTML = `
      <input id="a" /><textarea id="b"></textarea>
      <div role="dialog"><button id="c">x</button></div>
      <div role="menu"><button id="d">x</button></div>
      <button id="e">row</button>`;
    const el = (id: string) => document.getElementById(id);
    expect(isTypingTarget(el("a"))).toBe(true);
    expect(isTypingTarget(el("b"))).toBe(true);
    expect(isTypingTarget(el("c"))).toBe(true);
    expect(isTypingTarget(el("d"))).toBe(true);
    expect(isTypingTarget(el("e"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("resolveDrop", () => {
  const a = makeTodo({ id: "a", listId: "week", position: "a0" });
  const b = makeTodo({ id: "b", listId: "week", position: "a1" });
  const c = makeTodo({ id: "c", listId: "week", position: "a2" });
  const moving = makeTodo({ id: "m", listId: "today", position: "a0" });
  const rowsFor = (id: string) => (id === "week" ? [a, b, c] : [moving]);

  it("moves to a sidebar list", () => {
    expect(
      resolveDrop({ overId: "side:week", todo: moving, rowsFor, slot: 0 }),
    ).toEqual({ kind: "move", listId: "week" });
  });

  it("does nothing when dropped on its own sidebar list", () => {
    expect(
      resolveDrop({ overId: "side:today", todo: moving, rowsFor, slot: 0 }),
    ).toBeNull();
  });

  it("places into another column between the rows it was dropped between", () => {
    const drop = resolveDrop({
      overId: "col:week",
      todo: moving,
      rowsFor,
      slot: 1,
    });
    expect(drop?.kind).toBe("place");
    if (drop?.kind !== "place") return;
    expect(drop.listId).toBe("week");
    expect(drop.position > a.position && drop.position < b.position).toBe(true);
  });

  it("reorders within its own column", () => {
    const drop = resolveDrop({ overId: "col:week", todo: a, rowsFor, slot: 2 });
    expect(drop?.kind).toBe("place");
    if (drop?.kind !== "place") return;
    expect(drop.position > c.position).toBe(true);
  });

  it("does nothing when dropped back where it was", () => {
    expect(
      resolveDrop({ overId: "col:week", todo: b, rowsFor, slot: 1 }),
    ).toBeNull();
    expect(resolveDrop({ overId: null, todo: b, rowsFor, slot: 0 })).toBeNull();
  });
});
