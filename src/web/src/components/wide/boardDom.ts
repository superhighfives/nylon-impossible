import { DONE_COLUMN } from "./DoneColumn";

/**
 * The board's DOM lookups. Rows carry `data-row-id` and `data-row-list` on
 * their focusable title; columns carry `data-column`; sidebar buttons carry
 * `data-sidebar-nav`, plus `data-sidebar-list` or `data-sidebar-item`.
 */

/** The rows in a column, in DOM order (collapsing rows excluded). */
export function columnRows(listId: string): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-column="${CSS.escape(listId)}"] li:not([aria-hidden]) [data-row-id]`,
    ),
  );
}

/** The row that has focus, if any. */
export function focusedRow(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement ? el.closest("[data-row-id]") : null;
}

/**
 * The column focus is in: a row, the column's title (a click on its empty
 * space puts focus there), or anything else inside it.
 */
export function focusedColumn(): string | null {
  const el = document.activeElement;
  return el instanceof HTMLElement
    ? (el.closest<HTMLElement>("[data-column]")?.dataset.column ?? null)
    : null;
}

/** A todo's row, by id. */
export function rowById(id: string | null): HTMLElement | null {
  return id
    ? document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
    : null;
}

function sidebar() {
  return document.querySelector<HTMLElement>('aside[aria-label="Sidebar"]');
}

/** The sidebar item for a column: a list, or Done. */
export function sidebarItemFor(column: string | null): HTMLElement | null {
  if (!column) return null;
  return (
    sidebar()?.querySelector<HTMLElement>(
      column === DONE_COLUMN
        ? '[data-sidebar-item="done"]'
        : `[data-sidebar-list="${CSS.escape(column)}"]`,
    ) ?? null
  );
}

export function inSidebar(): boolean {
  return !!sidebar()?.contains(document.activeElement);
}

/** ↑ ↓ in the sidebar: the previous or next item. */
export function stepSidebar(delta: 1 | -1) {
  const items = Array.from(
    sidebar()?.querySelectorAll<HTMLElement>("[data-sidebar-nav]") ?? [],
  );
  const at = items.indexOf(document.activeElement as HTMLElement);
  items[at + delta]?.focus();
}

/** Focus is on the board (or nowhere), not the sidebar or toolbar. */
export function focusOnBoard(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !!active.closest("main");
}
