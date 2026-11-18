import type { BoardTimeKind } from "./board-path";
import { TIME_LIST_NAMES_IN_SENTENCE } from "./list-name";

/**
 * The written empty states, worded the same on the web's phone and wide
 * layouts and the Gmail card (in Swift, `EmptyCopy`): "Nothing today.",
 * "A clear week.", and "Nothing here yet." for Someday and your lists.
 */
export const EMPTY_COPY = {
  today: "Nothing today.",
  thisWeek: "A clear week.",
  someday: "Nothing here yet.",
  list: "Nothing here yet.",
} as const;

/**
 * Where an empty time list points next, when that list has todos: Today to
 * This week, This week to Someday.
 */
export const EMPTY_NEXT: Partial<Record<BoardTimeKind, BoardTimeKind>> = {
  today: "thisWeek",
  thisWeek: "someday",
};

/** The line under an empty Today or This week: "4 waiting in this week". */
export function waitingIn(count: number, kind: BoardTimeKind): string {
  return `${count} waiting in ${TIME_LIST_NAMES_IN_SENTENCE[kind]}`;
}
