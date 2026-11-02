import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRows, settleRows } from "../settle";

/** A column whose rows sit at `tops`, in the order given. */
function columnOf(listId: string, rows: [id: string, top: number][]) {
  const section = document.createElement("section");
  section.dataset.column = listId;
  const ul = document.createElement("ul");
  for (const [id, top] of rows) {
    const li = document.createElement("li");
    Object.defineProperty(li, "offsetTop", { value: top });
    li.animate = vi.fn();
    const body = document.createElement("div");
    body.dataset.rowId = id;
    li.appendChild(body);
    ul.appendChild(li);
  }
  section.appendChild(ul);
  document.body.appendChild(section);
  return ul;
}

const timing = { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
const animateOf = (ul: HTMLElement, i: number) =>
  vi.mocked((ul.children[i] as HTMLElement).animate);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("settleRows", () => {
  it("eases each moved row from where it was dropped", () => {
    const before = columnOf("today", [
      ["a", 0],
      ["b", 48],
      ["c", 96],
    ]);
    const from = captureRows(["today"]);
    before.closest("section")?.remove();
    // c dropped first.
    const after = columnOf("today", [
      ["c", 0],
      ["a", 48],
      ["b", 96],
    ]);

    expect(settleRows(after, "today", from, timing)).toBe(true);
    expect(animateOf(after, 0)).toHaveBeenCalledWith(
      [{ transform: "translateY(96px)" }, { transform: "none" }],
      timing,
    );
    expect(animateOf(after, 1)).toHaveBeenCalledWith(
      [{ transform: "translateY(-48px)" }, { transform: "none" }],
      timing,
    );
  });

  it("leaves rows new to the column and rows that didn't move alone", () => {
    columnOf("today", [["a", 0]]);
    columnOf("week", [["w", 0]]);
    const from = captureRows(["today", "week"]);
    document.body.innerHTML = "";
    const after = columnOf("week", [
      ["a", 0],
      ["w", 48],
    ]);

    expect(settleRows(after, "week", from, timing)).toBe(true);
    expect(animateOf(after, 0)).not.toHaveBeenCalled();
    expect(animateOf(after, 1)).toHaveBeenCalledOnce();

    const still = columnOf("today", [["x", 0]]);
    expect(settleRows(still, "today", from, timing)).toBe(false);
  });
});
