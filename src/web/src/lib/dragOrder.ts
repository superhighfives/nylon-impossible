import { generateKeyBetween } from "fractional-indexing";

interface Orderable {
  id: string;
  pinned: boolean;
  position: string;
}

/**
 * Order by fractional-index position, by code point, as D1, the API and iOS
 * do. Keys are base-62 and mix cases (`"Zz"` sorts before `"a0"`), so
 * `localeCompare` would disagree. Equal positions keep their order: the
 * sort is stable, so ties stay as the server sent them.
 */
export function byPosition(
  a: { position: string },
  b: { position: string },
): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
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

/**
 * The slot a todo dragged to `y` lands in, among a column's other rows: the
 * gap nearer `y` (`slotAt` over the rows' middles), clamped to its tier.
 * `rows` is every row in the column, top to bottom, in the same coordinates
 * as `y`, including the dragged one at `dragged` (-1 when it's from another
 * column); `items` is the column's order. The line and the touch gap both
 * come from it, so a finger and a pointer land a todo in the same place.
 */
export function dropSlot<T extends Orderable>(
  items: T[],
  item: T,
  rows: RowSpan[],
  dragged: number,
  y: number,
): number {
  const mids = rows
    .filter((_, i) => i !== dragged)
    .map((r) => (r.top + r.bottom) / 2);
  return dropPlacement(items, item, slotAt(mids, y)).index;
}

/** A row's vertical extent, in any one coordinate space. */
export interface RowSpan {
  top: number;
  bottom: number;
}

/**
 * Where the drop line for `slot` goes: the boundary between the two rows a
 * todo dropped there lands between, in the same coordinates as `rows`. Above
 * the first row for slot 0, below the last for the end slot. Null when there
 * are no rows.
 *
 * `rows` is every row in the column, top to bottom, including the dragged one
 * at `dragged` (-1 when it's in another column), which keeps its space while
 * faded. `slot` counts the *other* rows, as `slotAt` and `dropPlacement` do,
 * so the dragged row's own slot has two edges: the line takes whichever is
 * nearer the pointer at `y`.
 */
export function dropLineY(
  rows: RowSpan[],
  slot: number,
  dragged: number,
  y: number,
): number | null {
  if (rows.length === 0) return null;
  // The gap in `rows` the line marks: just before rows[gap].
  let gap = dragged < 0 || slot < dragged ? slot : slot + 1;
  if (slot === dragged) {
    const own = rows[dragged];
    gap = y - own.top <= own.bottom - y ? dragged : dragged + 1;
  }
  const above = rows[gap - 1];
  const below = rows[gap];
  if (!above) return below.top;
  if (!below) return above.bottom;
  return (above.bottom + below.top) / 2;
}

/**
 * How far the row at `index` shifts while a touch drag parts the rows: the
 * dragged row (from `from`, `height` tall) is headed for `slot` among the
 * others, so the rows between give up its space. Zero for the dragged row
 * itself, which follows the finger.
 */
export function partOffset(
  from: number,
  slot: number,
  index: number,
  height: number,
): number {
  if (index > from && index <= slot) return -height;
  if (index < from && index >= slot) return height;
  return 0;
}

/**
 * Where the gap a touch drag opens starts, from the top of the row list:
 * the space the parted rows leave for the dragged row (`spans[from]`, as tall
 * as it) at `slot` among the others. It sits where `partOffset` moves the
 * rows away from. Null if the spans aren't measured.
 */
export function gapTop(
  spans: RowSpan[],
  from: number,
  slot: number,
): number | null {
  // The row the gap opens beside: the last to move up, or the first to
  // move down (the dragged row's own, while it's over its slot).
  const own = spans[from];
  const at = spans[slot];
  if (!own || !at) return null;
  return slot > from ? at.bottom - (own.bottom - own.top) : at.top;
}

/**
 * How far the row at `index` of one board column shifts during a touch drag.
 * `from` is the dragged row's index if it started in this column, else null;
 * `slot` is the gap's slot among the column's other rows if the finger is
 * over this column, else null. Its own column parts around the gap
 * (`partOffset`) or, once the finger leaves, closes up; another column parts
 * to open the gap. One column holds the gap at a time.
 */
export function columnPart(
  from: number | null,
  slot: number | null,
  index: number,
  height: number,
): number {
  if (from !== null) {
    // Closing up: as if the dragged row were headed for the end.
    return index === from
      ? 0
      : partOffset(from, slot ?? Infinity, index, height);
  }
  return slot !== null && index >= slot ? height : 0;
}

/**
 * Where the gap a touch drag opens in a board column starts, in the rows'
 * coordinates: as `gapTop` in the dragged row's own column (`from`), and in
 * another column above the row at `slot`, below the last row, or at the top
 * of an empty column.
 */
export function columnGapTop(
  spans: RowSpan[],
  from: number | null,
  slot: number,
): number {
  if (from !== null) return gapTop(spans, from, slot) ?? 0;
  return spans[slot]?.top ?? spans.at(-1)?.bottom ?? 0;
}
