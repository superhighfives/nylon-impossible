import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adjacentSection,
  nextSection,
  SHEET,
  SIDEBAR,
  sectionOrder,
  stepIn,
  stepOut,
} from "../sections";

const COLUMNS = ["today", "week", "someday", "groceries", "done"];

describe("sectionOrder", () => {
  it("is the sidebar, then every column on the board left to right", () => {
    expect(sectionOrder(COLUMNS, null)).toEqual([SIDEBAR, ...COLUMNS]);
  });

  it("puts the open todo's sheet straight after its own column", () => {
    expect(sectionOrder(COLUMNS, "week")).toEqual([
      SIDEBAR,
      "today",
      "week",
      SHEET,
      "someday",
      "groceries",
      "done",
    ]);
    expect(sectionOrder(COLUMNS, "groceries").indexOf(SHEET)).toBe(5);
  });

  it("leaves out a sheet whose column isn't on the board", () => {
    expect(sectionOrder(COLUMNS, "hidden")).not.toContain(SHEET);
  });
});

describe("nextSection", () => {
  const order = sectionOrder(COLUMNS, "week");

  it("Tab visits every section in order and wraps", () => {
    const seen = [SIDEBAR];
    for (let i = 0; i < order.length; i++) {
      seen.push(nextSection(order, seen.at(-1) as string, 1));
    }
    expect(seen).toEqual([...order, SIDEBAR]);
  });

  it("⇧Tab goes back and wraps", () => {
    expect(nextSection(order, SIDEBAR, -1)).toBe("done");
    expect(nextSection(order, "someday", -1)).toBe(SHEET);
    expect(nextSection(order, SHEET, -1)).toBe("week");
  });
});

describe("adjacentSection", () => {
  const order = sectionOrder(COLUMNS, null);

  it("← from Today is the sidebar, → from the sidebar is Today", () => {
    expect(adjacentSection(order, "today", -1)).toBe(SIDEBAR);
    expect(adjacentSection(order, SIDEBAR, 1)).toBe("today");
    expect(adjacentSection(order, "week", -1)).toBe("today");
  });

  it("doesn't wrap at either end", () => {
    expect(adjacentSection(order, SIDEBAR, -1)).toBeNull();
    expect(adjacentSection(order, "done", 1)).toBeNull();
  });

  it("reaches the sheet beside its column", () => {
    const withSheet = sectionOrder(COLUMNS, "week");
    expect(adjacentSection(withSheet, "week", 1)).toBe(SHEET);
    expect(adjacentSection(withSheet, SHEET, 1)).toBe("someday");
  });
});

describe("stepIn (Return on a section)", () => {
  const column = { rows: 2, hasAdd: true, cameFrom: "week" };

  it("goes to a column's first todo, else its Add", () => {
    expect(stepIn("week", column)).toEqual({ to: "row" });
    expect(stepIn("week", { ...column, rows: 0 })).toEqual({ to: "add" });
  });

  it("goes to Done's first todo, and stays on an empty Done", () => {
    const done = { ...column, hasAdd: false };
    expect(stepIn("done", done)).toEqual({ to: "row" });
    expect(stepIn("done", { ...done, rows: 0 })).toEqual({ to: "stay" });
  });

  it("goes to the sidebar's entry for the column it came from", () => {
    expect(stepIn(SIDEBAR, column)).toEqual({ to: "entry", column: "week" });
  });

  it("goes to the sheet's title", () => {
    expect(stepIn(SHEET, column)).toEqual({ to: "title" });
  });
});

describe("stepOut (Esc)", () => {
  it("steps out of a column to it, closing an open todo first", () => {
    expect(stepOut({ id: "week", level: "in" }, false)).toEqual({
      to: "section",
      id: "week",
    });
    expect(stepOut({ id: "week", level: "in" }, true)).toEqual({
      to: "close",
    });
  });

  it("goes from a column's section to its sidebar entry", () => {
    expect(stepOut({ id: "week", level: "on" }, false)).toEqual({
      to: "entry",
      column: "week",
    });
  });

  it("steps out of the sidebar to it, and no further", () => {
    expect(stepOut({ id: SIDEBAR, level: "in" }, false)).toEqual({
      to: "section",
      id: SIDEBAR,
    });
    expect(stepOut({ id: SIDEBAR, level: "on" }, false)).toEqual({
      to: "stay",
    });
  });

  it("steps out of the sheet to it, then closes it onto its row", () => {
    expect(stepOut({ id: SHEET, level: "in" }, true)).toEqual({
      to: "section",
      id: SHEET,
    });
    expect(stepOut({ id: SHEET, level: "on" }, true)).toEqual({
      to: "close-to-row",
    });
  });
});

describe("the outline", () => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  const styles = read("../../../styles.css");
  const tokens = read("../../../styles/tokens.css");
  /** The `n-section-outline` utility's CSS. */
  const rule = styles.slice(
    styles.indexOf("@utility n-section-outline"),
    styles.indexOf("\n}\n", styles.indexOf("@utility n-section-outline")),
  );

  it("is an overlay inside the section's edges, not a border or padding on it", () => {
    expect(rule).toContain("&::after");
    expect(rule).toMatch(/position: absolute;\s+inset: 0;/);
    expect(rule).toContain("pointer-events: none");
    expect(rule).toContain("border-radius: inherit");
    // Everything it draws is on the overlay.
    const outside = rule.replace(/&::after \{[^}]*\}/, "");
    expect(outside).not.toMatch(/(border|padding|margin|outline)[a-z-]*:/);
  });

  it("is the sectionOutline colour at the token's width, never brand", () => {
    expect(rule).toContain(
      "var(--n-board-section-outline-width) solid\n      var(--n-color-section-outline)",
    );
    expect(rule).not.toContain("brand");
    expect(tokens).toContain("--n-board-section-outline-width: 0.25rem;");
  });

  it("shows only on the marked section while the keyboard's in use", () => {
    expect(rule).toContain("display: none");
    expect(rule).toContain("[data-keyboard] &[data-key-section]::after");
  });
});
