import { describe, expect, it } from "vitest";
import { makeTodo } from "@/components/phone/__tests__/fixtures";
import { COMMANDS, commandForKey, keyHint, visibleCommands } from "../commands";
import { resolveDrop } from "../drop";
import { isTypingTarget } from "../keys";

const idFor = (e: Parameters<typeof commandForKey>[0], afterG = false) =>
  commandForKey(e, { afterG })?.command.id ?? null;

describe("commandForKey", () => {
  it.each([
    [{ key: "j" }, "next"],
    [{ key: "ArrowDown" }, "next"],
    [{ key: "k" }, "previous"],
    [{ key: "ArrowUp" }, "previous"],
    [{ key: "l" }, "right"],
    [{ key: "ArrowRight" }, "right"],
    [{ key: "h" }, "left"],
    [{ key: "ArrowLeft" }, "left"],
    [{ key: "Escape" }, "back"],
    [{ key: "x" }, "done"],
    [{ key: "1" }, "move-today"],
    [{ key: "2" }, "move-thisWeek"],
    [{ key: "3" }, "move-someday"],
    [{ key: "m" }, "move-to"],
    [{ key: "p" }, "pin"],
    [{ key: "d" }, "due"],
    [{ key: "Backspace" }, "delete"],
    [{ key: "Delete" }, "delete"],
    [{ key: "n" }, "new-todo"],
    [{ key: "N", shiftKey: true }, "new-list"],
    [{ key: "z" }, "undo"],
    [{ key: "f" }, "feedback"],
    [{ key: "?", shiftKey: true }, "shortcuts"],
    [{ key: "g" }, "go"],
    [{ key: "k", metaKey: true }, "palette"],
    [{ key: "k", ctrlKey: true }, "palette"],
  ])("%o → %s", (e, id) => {
    expect(idFor(e)).toBe(id);
  });

  it("reads ⇧-digits by code, since Shift changes the key", () => {
    const shift = (n: number, key: string) => ({
      key,
      code: `Digit${n}`,
      shiftKey: true,
    });
    expect(idFor(shift(1, "!"))).toBe("go-today");
    expect(idFor(shift(2, "@"))).toBe("go-thisWeek");
    expect(idFor(shift(3, "#"))).toBe("go-someday");
    expect(idFor(shift(0, ")"))).toBe("go-done");
    const lists = commandForKey(shift(6, "^"));
    expect(lists?.command.id).toBe("go-list");
    expect(lists?.arg).toBe(2);
    // Unshifted, the digits still move the todo.
    expect(idFor({ key: "1", code: "Digit1" })).toBe("move-today");
  });

  it("maps the letters after G to destinations", () => {
    expect(idFor({ key: "t" }, true)).toBe("go-today");
    expect(idFor({ key: "w" }, true)).toBe("go-thisWeek");
    expect(idFor({ key: "s" }, true)).toBe("go-someday");
    expect(idFor({ key: "d" }, true)).toBe("go-done");
    expect(idFor({ key: "l" }, true)).toBe("go-lists");
    expect(idFor({ key: "x" }, true)).toBeNull();
  });

  it("leaves modified and unmapped keys to the browser", () => {
    expect(idFor({ key: "x", metaKey: true })).toBeNull();
    expect(idFor({ key: "1", ctrlKey: true })).toBeNull();
    expect(idFor({ key: "j", altKey: true })).toBeNull();
    expect(idFor({ key: "q" })).toBeNull();
    // Enter opens natively: the focused row is a button.
    expect(idFor({ key: "Enter" })).toBeNull();
  });
});

describe("the registry", () => {
  it("gives every command a unique id and some way to press it", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMMANDS) expect(c.keys.length).toBeGreaterThan(0);
  });

  it("hides Send feedback from everyone but admins", () => {
    expect(visibleCommands(false).some((c) => c.id === "feedback")).toBe(false);
    expect(visibleCommands(true).some((c) => c.id === "feedback")).toBe(true);
  });

  it("joins a command's first keys into a hint", () => {
    expect(keyHint("go-today")).toBe("⇧1");
    expect(keyHint("palette")).toBe("⌘K");
    expect(keyHint("done")).toBe("X");
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
