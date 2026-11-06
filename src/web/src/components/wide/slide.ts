import type { SettleTiming } from "./settle";

/**
 * Columns slide; they never jump (principle 8). The board's row (`main`)
 * holds its columns and the sheet as direct children, each named by
 * `data-slide`. After every render `slideColumns` measures them (FLIP:
 * first, last, invert, play): one that moved since the last pass starts
 * from where it was and slides to its new place, so opening a todo, closing
 * it, or a list arriving or leaving moves the columns after it along.
 */

/** Where each of the row's children was laid out, by its `data-slide`. */
export type Placed = Map<string, number>;

const SLIDE_ID = "board-slide";

/** The row's children, left to right. */
function slides(board: HTMLElement): HTMLElement[] {
  return [...board.querySelectorAll<HTMLElement>(":scope > [data-slide]")];
}

/**
 * Slide each of `board`'s children that moved since `placed` was recorded
 * from there to its new place, and record where they are now. Nothing
 * animates without `timing` (reduced motion); new children appear in place.
 */
export function slideColumns(
  board: HTMLElement,
  placed: Placed,
  timing: SettleTiming | null,
) {
  const origin =
    board.getBoundingClientRect().left + board.clientLeft - board.scrollLeft;
  const seen = new Set<string>();
  for (const el of slides(board)) {
    const key = el.dataset.slide;
    if (!key) continue;
    seen.add(key);
    // Layout, so a slide in flight doesn't count.
    const now = el.offsetLeft;
    const was = placed.get(key);
    placed.set(key, now);
    if (!timing || was === undefined || was === now) continue;
    // Mid-slide already: carry on from where it's drawn.
    const drawn = el.getBoundingClientRect().left - origin - now;
    for (const a of el.getAnimations?.() ?? []) {
      if (a.id === SLIDE_ID) a.cancel();
    }
    el.animate?.(
      [
        { transform: `translateX(${was - now + drawn}px)` },
        { transform: "none" },
      ],
      { ...timing, id: SLIDE_ID },
    );
  }
  for (const key of placed.keys()) if (!seen.has(key)) placed.delete(key);
}

/**
 * Take the closing sheet out of the row where it lies, so the columns after
 * it close the gap while it slides away, over them. Undone when it reopens.
 */
export function holdLeavingSheet(sheet: HTMLElement | null, leaving: boolean) {
  if (!sheet) return;
  if (!leaving) {
    sheet.style.removeProperty("position");
    sheet.style.removeProperty("left");
    sheet.style.removeProperty("margin-left");
    return;
  }
  if (sheet.style.position === "absolute") return;
  const left = sheet.offsetLeft;
  sheet.style.position = "absolute";
  sheet.style.left = `${left}px`;
  sheet.style.marginLeft = "0";
}

/** The `[left, right]` of a row child, in the row's scrolled content. */
export function spanOf(el: HTMLElement) {
  return { left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth };
}
