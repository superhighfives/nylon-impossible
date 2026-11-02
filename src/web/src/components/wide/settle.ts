import { columnRows } from "./boardDom";

/**
 * Where each row in the columns a drop touches sat when it was dropped, by
 * todo id: its column and its offset within the column's row list.
 */
export type SettleFrom = Map<string, { listId: string; top: number }>;

/** How long rows take to settle, and their easing, from the tokens. */
export interface SettleTiming {
  duration: number;
  easing: string;
}

/** Each row's place in `listIds`' columns, captured just before a drop. */
export function captureRows(listIds: string[]): SettleFrom {
  const from: SettleFrom = new Map();
  for (const listId of new Set(listIds)) {
    for (const el of columnRows(listId)) {
      const li = el.closest("li");
      const id = el.dataset.rowId;
      if (li && id) from.set(id, { listId, top: li.offsetTop });
    }
  }
  return from;
}

/** `--n-duration-base` and `--n-ease-out-strong`, or null if unset. */
export function settleTiming(): SettleTiming | null {
  const style = getComputedStyle(document.documentElement);
  const raw = style.getPropertyValue("--n-duration-base").trim();
  // A CSS time: `220ms`, or `0.22s`.
  const duration =
    Number.parseFloat(raw) *
    (raw.endsWith("ms") ? 1 : raw.endsWith("s") ? 1000 : Number.NaN);
  const easing = style.getPropertyValue("--n-ease-out-strong").trim();
  return Number.isFinite(duration) && easing ? { duration, easing } : null;
}

/**
 * Ease the rows of `list`, column `listId`, from where they were in `from`
 * to where they are now. Rows new to the column, or that didn't move, are
 * left alone. True if any row moved.
 */
export function settleRows(
  list: HTMLElement,
  listId: string,
  from: SettleFrom,
  timing: SettleTiming,
): boolean {
  let moved = false;
  for (const li of list.querySelectorAll<HTMLElement>(":scope > li")) {
    const id = li.querySelector<HTMLElement>("[data-row-id]")?.dataset.rowId;
    const was = id ? from.get(id) : undefined;
    if (!was || was.listId !== listId) continue;
    const dy = was.top - li.offsetTop;
    if (dy === 0) continue;
    moved = true;
    li.animate?.(
      [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
      timing,
    );
  }
  return moved;
}
