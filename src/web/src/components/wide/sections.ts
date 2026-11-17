/**
 * The wide board's sections (principle 7): the sidebar, each column on the
 * board, and the open todo's sheet. The keyboard is either **on** a section
 * (outlined, nothing in it chosen) or **in** it. Tab and ⇧Tab move between
 * sections and wrap; ← → move to the adjacent one and don't; Return steps in
 * and Esc steps out. This module is the order and those rules; `createBoard`
 * carries them out.
 */

/** The sidebar, as a section. */
export const SIDEBAR = "sidebar";
/** The open todo's sheet, as a section. */
export const SHEET = "sheet";

export type Level = "on" | "in";

/** Where the keyboard is: a column's id, the sidebar or the sheet. */
export interface KeySection {
  id: string;
  level: Level;
}

/**
 * The sections in Tab order: the sidebar, then the columns on the board left
 * to right (`columnIds`: the time lists, the lists you haven't hidden, Done),
 * with the open todo's sheet straight after its own column, where it's drawn.
 */
export function sectionOrder(
  columnIds: string[],
  sheetAfter: string | null,
): string[] {
  const order = [SIDEBAR];
  for (const id of columnIds) {
    order.push(id);
    if (id === sheetAfter) order.push(SHEET);
  }
  return order;
}

/** Tab (1) or ⇧Tab (-1): the next or previous section, wrapping. */
export function nextSection(
  order: string[],
  from: string,
  delta: 1 | -1,
): string {
  const at = order.indexOf(from);
  if (at === -1) return order[delta > 0 ? 0 : order.length - 1];
  return order[(at + delta + order.length) % order.length];
}

/**
 * → (1) or ← (-1) on a section: the adjacent one, or null past either end.
 * ← from the first column is the sidebar; nothing wraps.
 */
export function adjacentSection(
  order: string[],
  from: string,
  delta: 1 | -1,
): string | null {
  const at = order.indexOf(from);
  if (at === -1) return null;
  return order[at + delta] ?? null;
}

/** What Return on a section does. */
export type StepIn =
  /** The sidebar: the entry for the column the keyboard came from. */
  | { to: "entry"; column: string }
  /** The sheet: its title, ready to edit. */
  | { to: "title" }
  /** A column with todos: its first. */
  | { to: "row" }
  /** A column with Add and no todos: Add, not typing yet. */
  | { to: "add" }
  /** An empty Done: nothing to step into. */
  | { to: "stay" };

export function stepIn(
  section: string,
  column: { rows: number; hasAdd: boolean; cameFrom: string },
): StepIn {
  if (section === SIDEBAR) return { to: "entry", column: column.cameFrom };
  if (section === SHEET) return { to: "title" };
  if (column.rows > 0) return { to: "row" };
  return column.hasAdd ? { to: "add" } : { to: "stay" };
}

/** What Esc does. Typing in Add, or a field in the sheet, stops first. */
export type StepOut =
  /** Onto a section: from inside it, or from a column to the sidebar's. */
  | { to: "section"; id: string }
  /** A column's section: to the sidebar, on that column's entry. */
  | { to: "entry"; column: string }
  /** Close the open todo, the keyboard staying where it is in its column. */
  | { to: "close" }
  /** The sheet's section: close it, and back to its row. */
  | { to: "close-to-row" }
  /** The sidebar's section: nowhere further out. */
  | { to: "stay" };

export function stepOut(at: KeySection, detailOpen: boolean): StepOut {
  if (at.id === SIDEBAR) {
    return at.level === "in" ? { to: "section", id: SIDEBAR } : { to: "stay" };
  }
  if (at.id === SHEET) {
    return at.level === "in"
      ? { to: "section", id: SHEET }
      : { to: "close-to-row" };
  }
  if (at.level === "on") return { to: "entry", column: at.id };
  // In a column: an open todo closes first, then out to the column.
  return detailOpen ? { to: "close" } : { to: "section", id: at.id };
}

/** A column's id, not the sidebar or the sheet. */
export function isColumnSection(id: string): boolean {
  return id !== SIDEBAR && id !== SHEET;
}
