import { generateKeyBetween } from "fractional-indexing";

interface Orderable {
  id: string;
  sticky: boolean;
  position: string;
}

/**
 * Clamp an insertion index into the dragged row's own tier. A list's
 * incomplete order is pinned (sticky) rows first, then the rest, so a pinned
 * row can only land among the pinned and an unpinned one only after them.
 *
 * `items` is the target list's order *without* the dragged row; `index` is a
 * slot in `0..items.length`.
 */
export function clampToTier<T extends Orderable>(
  items: T[],
  sticky: boolean,
  index: number,
): number {
  const stickyCount = items.filter((t) => t.sticky).length;
  return sticky
    ? Math.min(Math.max(index, 0), stickyCount)
    : Math.min(Math.max(index, stickyCount), items.length);
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
  const at = clampToTier(items, item.sticky, index);
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
  const prev = before && before.sticky === item.sticky ? before : null;
  const next = after && after.sticky === item.sticky ? after : null;
  // Duplicate or out-of-order neighbours (possible after concurrent edits)
  // would make generateKeyBetween throw; append after `prev` instead.
  if (prev && next && prev.position >= next.position) {
    return generateKeyBetween(prev.position, null);
  }
  return generateKeyBetween(prev?.position ?? null, next?.position ?? null);
}
