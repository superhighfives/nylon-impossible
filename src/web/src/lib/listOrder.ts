import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

interface Positioned {
  id: string;
  position: string;
}

/** A list's new position, as `PATCH /lists/:id` takes it. */
export interface ListMove {
  id: string;
  position: string;
}

/**
 * The positions that put list `id` at slot `to` among the *other* lists in
 * `lists` (your lists, in order), as the iPhone's `reorderList` does: one
 * new position between its new neighbours. Empty when it's already there.
 *
 * Lists with tied positions (made elsewhere with the same one) have no key
 * between them, so then every list is numbered afresh in the new order, and
 * only the ones whose position changes are returned.
 */
export function listMoves<T extends Positioned>(
  lists: T[],
  id: string,
  to: number,
): ListMove[] {
  const from = lists.findIndex((l) => l.id === id);
  if (from < 0) return [];
  const others = lists.filter((l) => l.id !== id);
  const at = Math.min(Math.max(to, 0), others.length);
  if (at === from) return [];
  const prev = others[at - 1];
  const next = others[at];
  if (!prev || !next || prev.position < next.position) {
    return [
      {
        id,
        position: generateKeyBetween(
          prev?.position ?? null,
          next?.position ?? null,
        ),
      },
    ];
  }
  const order = [...others.slice(0, at), lists[from], ...others.slice(at)];
  const keys = generateNKeysBetween(null, null, order.length);
  return order.flatMap((l, i) =>
    keys[i] === l.position ? [] : [{ id: l.id, position: keys[i] }],
  );
}

/**
 * ⌥↑ (-1) and ⌥↓ (1): list `id` one place up or down. Empty past the first
 * or last of your lists.
 */
export function stepMoves<T extends Positioned>(
  lists: T[],
  id: string,
  delta: 1 | -1,
): ListMove[] {
  const from = lists.findIndex((l) => l.id === id);
  if (from < 0) return [];
  const to = from + delta;
  if (to < 0 || to >= lists.length) return [];
  return listMoves(lists, id, to);
}

/** `lists` with `moves`' positions written in. */
export function applyMoves<T extends Positioned>(
  lists: T[],
  moves: ListMove[],
): T[] {
  const at = new Map(moves.map((m) => [m.id, m.position]));
  return lists.map((l) => {
    const position = at.get(l.id);
    return position === undefined ? l : { ...l, position };
  });
}
