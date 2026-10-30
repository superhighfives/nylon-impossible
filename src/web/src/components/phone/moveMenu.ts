/**
 * What the phone menu's "Move to" group offers, as Apple's MoveMenuPlan does:
 * the other time lists with an arrow that points the way they lie (Today ←
 * This week → Someday), the two lists moved to most recently, and the rest
 * under "More". Pure, so the choices can be tested; the recents live in this
 * browser's storage.
 */
import type { SystemListKind } from "@/types/database";

export interface MoveTarget {
  id: string;
  label: string;
  /** Set for Today, This week and Someday; null for your lists. */
  kind: SystemListKind | null;
}

export interface MovePlan {
  timeLists: MoveTarget[];
  recent: MoveTarget[];
  more: MoveTarget[];
}

export const RECENT_MOVE_LIMIT = 2;
const RECENT_MOVE_KEY = "nylon:recent-move-lists";
const RECENT_MOVE_HISTORY = 20;
const TIME_ORDER: SystemListKind[] = ["today", "thisWeek", "someday"];

/**
 * `others` is every list but the todo's own, in display order. Recents that
 * are gone (or are the todo's own list) are skipped, and a short history is
 * topped up from the top of your lists.
 */
export function moveMenuPlan(
  others: MoveTarget[],
  recentIds: string[],
): MovePlan {
  const timeLists = others.filter((t) => t.kind !== null);
  const collections = others.filter((t) => t.kind === null);
  const recent: MoveTarget[] = [];
  for (const id of recentIds) {
    const list = collections.find(
      (l) => l.id.toLowerCase() === id.toLowerCase(),
    );
    if (list && !recent.includes(list)) recent.push(list);
    if (recent.length === RECENT_MOVE_LIMIT) break;
  }
  for (const list of collections) {
    if (recent.length >= RECENT_MOVE_LIMIT) break;
    if (!recent.includes(list)) recent.push(list);
  }
  return {
    timeLists,
    recent,
    more: collections.filter((l) => !recent.includes(l)),
  };
}

/**
 * Left when the target comes earlier in Today → This week → Someday than the
 * todo's own list; right otherwise, including from one of your lists.
 */
export function moveArrow(
  target: MoveTarget,
  from: SystemListKind | null,
): "left" | "right" {
  if (!from || !target.kind) return "right";
  return TIME_ORDER.indexOf(target.kind) < TIME_ORDER.indexOf(from)
    ? "left"
    : "right";
}

/** Your lists most recently moved to in this browser, newest first. */
export function readRecentMoves(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_MOVE_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/** Put `listId` first, keeping one copy. Storage can be unavailable. */
export function recordRecentMove(listId: string) {
  try {
    const kept = readRecentMoves().filter(
      (id) => id.toLowerCase() !== listId.toLowerCase(),
    );
    globalThis.localStorage?.setItem(
      RECENT_MOVE_KEY,
      JSON.stringify([listId, ...kept].slice(0, RECENT_MOVE_HISTORY)),
    );
  } catch {
    // Private mode or blocked storage: the menu tops up from your lists.
  }
}
