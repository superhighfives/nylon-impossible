import { columnRows } from "./boardDom";

/**
 * Where each row in the columns a drop touches sat when it was dropped, by
 * todo id: its column and its offset within the column's row list.
 */
export type SettleFrom = Map<string, { listId: string; top: number }>;

/** Where the dropped todo was let go, in the column it's landing in. */
export interface Landing {
  id: string;
  listId: string;
  top: number;
}

/** What a drop's columns settle from. */
export interface Settle {
  from: SettleFrom;
  landing: Landing | null;
}

/**
 * How long a drop's capture lasts. After that, later changes to the columns
 * don't animate from the old places, and a row still held is let go.
 */
export const SETTLE_TTL_MS = 1000;

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

/** The drag preview's box, while it's on screen. */
export function previewRect(): DOMRect | null {
  return (
    document
      .querySelector<HTMLElement>("[data-drag-preview]")
      ?.getBoundingClientRect() ?? null
  );
}

/**
 * Where the dropped todo should settle from: the preview's place in column
 * `listId`, centred on the preview, rather than its old slot. Until the new
 * order renders, its old row is held there too, or hidden if it's leaving
 * its column, so it never flashes at its old slot.
 */
export function landAt(
  from: SettleFrom,
  todoId: string,
  listId: string,
  preview: DOMRect,
): Landing | null {
  const was = from.get(todoId);
  const area = document.querySelector<HTMLElement>(
    `[data-drop-area="${CSS.escape(listId)}"]`,
  );
  const row = was
    ? columnRows(was.listId)
        .find((el) => el.dataset.rowId === todoId)
        ?.closest("li")
    : null;
  if (!was || !area || !row) return null;
  const top =
    preview.top +
    preview.height / 2 -
    area.getBoundingClientRect().top -
    row.offsetHeight / 2;
  const hold =
    was.listId === listId
      ? { transform: `translateY(${top - row.offsetTop}px)` }
      : { opacity: 0 };
  row.animate?.([hold, hold], { duration: SETTLE_TTL_MS });
  return { id: todoId, listId, top };
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
 * (the dropped todo from `landing`, if given) to where they are now. Rows new
 * to the column, or that didn't move, are left alone. True if any row moved;
 * false until the drop's new order has rendered.
 */
export function settleRows(
  list: HTMLElement,
  listId: string,
  from: SettleFrom,
  timing: SettleTiming,
  landing: Landing | null = null,
): boolean {
  const rows = [...list.querySelectorAll<HTMLElement>(":scope > li")].map(
    (li) => ({
      li,
      id: li.querySelector<HTMLElement>("[data-row-id]")?.dataset.rowId,
    }),
  );
  if (landing) {
    // Still in its old place: the new order hasn't rendered yet.
    const was = from.get(landing.id);
    const dropped = rows.find((row) => row.id === landing.id);
    if (dropped && was?.listId === listId && dropped.li.offsetTop === was.top) {
      return false;
    }
  }
  const startOf = (id: string | undefined) => {
    if (!id) return undefined;
    if (id === landing?.id && landing.listId === listId) return landing;
    return from.get(id);
  };
  let moved = false;
  for (const { li, id } of rows) {
    const was = startOf(id);
    if (!was || was.listId !== listId) continue;
    // Ends `landAt`'s hold, so the settle starts from where it held.
    for (const held of li.getAnimations?.() ?? []) held.cancel();
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
