import type { BoardTimeKind } from "./board-path";

/**
 * The time lists' names mid-sentence: "Moved to this week", "2 waiting in
 * someday". They keep their capitals only where they stand alone as a name
 * (a column head, a menu item), which is the list's own `name`.
 */
export const TIME_LIST_NAMES_IN_SENTENCE: Record<BoardTimeKind, string> = {
  today: "today",
  thisWeek: "this week",
  someday: "someday",
};

/**
 * A list's name as it reads inside a sentence. A time list is chosen by its
 * kind, not its name, so a list of yours called "Today" keeps its capital.
 */
export function listNameInSentence(list: {
  name: string;
  systemKind?: BoardTimeKind | null;
}): string {
  return list.systemKind
    ? TIME_LIST_NAMES_IN_SENTENCE[list.systemKind]
    : list.name;
}
