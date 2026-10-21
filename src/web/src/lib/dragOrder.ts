import { generateKeyBetween } from "fractional-indexing";

interface Orderable {
  id: string;
  pinned: boolean;
  position: string;
}

/**
 * Clamp an insertion index into the dragged row's own tier. A list's
 * incomplete order is pinned rows first, then the rest, so a pinned
 * row can only land among the pinned and an unpinned one only after them.
 *
 * `items` is the target list's order *without* the dragged row; `index` is a
 * slot in `0..items.length`.
 */
export function clampToTier<T extends Orderable>(
  items: T[],
  pinned: boolean,
  index: number,
): number {
  const pinnedCount = items.filter((t) => t.pinned).length;
  return pinned
    ? Math.min(Math.max(index, 0), pinnedCount)
    : Math.min(Math.max(index, pinnedCount), items.length);
}

/**
 * Insert `item` into `items` (which must not already contain it) at `index`,
 * clamped into its tier.
 */
export function insertInTier<T extends Orderable>(
  items: T[],
  item: T,
  index: number,
): T[] {
  const at = clampToTier(items, item.pinned, index);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/**
 * A fractional position for the row at `index` in `items` (which includes
 * it), between its neighbours in the same tier. Neighbours across the tier
 * boundary are ignored — tiers sort independently.
 */
export function positionAt<T extends Orderable>(
  items: T[],
  index: number,
): string {
  const item = items[index];
  const before = items[index - 1];
  const after = items[index + 1];
  const prev = before && before.pinned === item.pinned ? before : null;
  const next = after && after.pinned === item.pinned ? after : null;
  // Duplicate or out-of-order neighbours (possible after concurrent edits)
  // would make generateKeyBetween throw; append after `prev` instead.
  if (prev && next && prev.position >= next.position) {
    return generateKeyBetween(prev.position, null);
  }
  return generateKeyBetween(prev?.position ?? null, next?.position ?? null);
}

/**
 * Where a todo dropped at slot `index` of a list lands: the slot clamped into
 * its pinned/unpinned tier, and a fractional position between its new
 * neighbours. `items` is the list's open order and may include the todo
 * itself (a reorder within its own list); it's taken out first, so `index`
 * counts the other rows.
 */
export function dropPlacement<T extends Orderable>(
  items: T[],
  item: T,
  index: number,
): { index: number; position: string } {
  const others = items.filter((t) => t.id !== item.id);
  const at = clampToTier(others, item.pinned, index);
  const next = [...others.slice(0, at), item, ...others.slice(at)];
  return { index: at, position: positionAt(next, at) };
}

/**
 * The slot (0…n) a pointer at `y` points to among rows whose vertical
 * midpoints are `mids`, top to bottom: before the first row whose middle is
 * below the pointer.
 */
export function slotAt(mids: number[], y: number): number {
  const i = mids.findIndex((mid) => y < mid);
  return i === -1 ? mids.length : i;
}
