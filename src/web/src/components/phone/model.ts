/**
 * Pure helpers behind the phone layout: page order, row meta formatting,
 * composer submission planning, and Done-history grouping. Kept free of React
 * so they're cheap to unit test (see `__tests__/model.test.ts`).
 */
import {
  dayKeyIn,
  daysBetweenKeys,
  dueDayKey,
  parseTodoDate,
  type Recurrence,
} from "@nylon-impossible/shared";
import type {
  SerializedList,
  SystemListKind,
  TodoWithUrls,
} from "@/types/database";

/** The four pages the switcher pages between, in swipe order. */
export const PAGES = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This Week" },
  { key: "someday", label: "Someday" },
  { key: "lists", label: "Lists" },
] as const;

export type PageKey = (typeof PAGES)[number]["key"];

export const TIME_KINDS: SystemListKind[] = ["today", "thisWeek", "someday"];

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Whole calendar days from today (in `timeZone`) to the due day. */
export function daysUntil(
  dueDate: string | Date,
  now: Date,
  timeZone: string,
): number {
  return daysBetweenKeys(dayKeyIn(now, timeZone), dueDayKey(dueDate));
}

/** Due days are UTC-midnight calendar days, so format them in UTC. */
function formatDay(
  dueDate: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(dueDate).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}

export interface DueLabel {
  text: string;
  overdue: boolean;
}

/**
 * The row's due label: "Today", "Tomorrow", a weekday within the week
 * ("Fri"), otherwise "Oct 30"; past days read "3 days overdue".
 */
export function dueLabel(
  dueDate: string | Date,
  now: Date,
  timeZone: string,
): DueLabel {
  const diff = daysUntil(dueDate, now, timeZone);
  if (diff < 0) {
    const n = -diff;
    return { text: `${n} ${n === 1 ? "day" : "days"} overdue`, overdue: true };
  }
  if (diff === 0) return { text: "Today", overdue: false };
  if (diff === 1) return { text: "Tomorrow", overdue: false };
  if (diff < 7)
    return { text: formatDay(dueDate, { weekday: "short" }), overdue: false };
  return {
    text: formatDay(dueDate, { month: "short", day: "numeric" }),
    overdue: false,
  };
}

const REPEAT_LABELS: Record<Recurrence["frequency"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function repeatLabel(recurrence: Recurrence): string {
  return REPEAT_LABELS[recurrence.frequency];
}

/** "visitlisboa.com" from "https://www.visitlisboa.com/tram-28". */
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type MetaPart =
  | { kind: "pin"; text: string }
  | { kind: "due"; text: string; overdue: boolean }
  | { kind: "repeat"; text: string }
  | { kind: "subtasks"; text: string }
  | { kind: "notes"; text: string }
  | { kind: "link"; text: string };

/**
 * The meta line under a row's title, in spec order, showing only what's set:
 * Pinned, due, repeat, subtasks n/m, a notes glyph, the first link's domain.
 */
export function rowMeta(
  todo: TodoWithUrls,
  subtasks: TodoWithUrls[],
  now: Date,
  timeZone: string,
): MetaPart[] {
  const parts: MetaPart[] = [];
  if (todo.pinned) parts.push({ kind: "pin", text: "Pinned" });
  if (todo.dueDate) {
    const due = dueLabel(todo.dueDate, now, timeZone);
    parts.push({ kind: "due", text: due.text, overdue: due.overdue });
  }
  if (todo.recurrence) {
    parts.push({ kind: "repeat", text: repeatLabel(todo.recurrence) });
  }
  if (subtasks.length > 0) {
    const done = subtasks.filter((s) => s.completed).length;
    parts.push({ kind: "subtasks", text: `${done}/${subtasks.length}` });
  }
  if (todo.notes?.trim()) parts.push({ kind: "notes", text: "Notes" });
  const firstLink = [...todo.urls].sort((a, b) =>
    a.position.localeCompare(b.position),
  )[0];
  if (firstLink) parts.push({ kind: "link", text: linkDomain(firstLink.url) });
  return parts;
}

/** A plain-text reading of the meta line, for the row's accessible name. */
export function metaSummary(parts: MetaPart[]): string {
  return parts
    .map((p) => {
      switch (p.kind) {
        case "due":
          return p.overdue ? p.text : `Due ${p.text}`;
        case "repeat":
          return `Repeats ${p.text.toLowerCase()}`;
        case "subtasks":
          return `${p.text} subtasks`;
        case "notes":
          return "Has notes";
        case "link":
          return `Link to ${p.text}`;
        default:
          return p.text;
      }
    })
    .join(", ");
}

export interface PlannedTodo {
  /** Text for smart-create, date words removed when a date parsed. */
  text: string;
  /** The parsed due day, or null. */
  dueDay: Date | null;
}

/**
 * What a composer submit creates. Every non-empty line is its own todo, so a
 * pasted list adds one todo per line; each line runs the typed-date parser
 * unless the "Due …" chip was dismissed (`keepDateWords`), in which case the
 * words stay as typed. A single overlong line is passed through whole —
 * smart-create's `splitTodoText` spills it into notes.
 */
export function planSubmit(
  draft: string,
  options: { keepDateWords: boolean; now: Date; timeZone: string },
): PlannedTodo[] {
  return draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (options.keepDateWords) return { text: line, dueDay: null };
      const parsed = parseTodoDate(line, {
        now: options.now,
        timeZone: options.timeZone,
      });
      return parsed.dueDay
        ? { text: parsed.title, dueDay: parsed.dueDay }
        : { text: line, dueDay: null };
    });
}

/** The due day the composer's chip shows: the first line's parse. */
export function draftDueDay(
  draft: string,
  options: { now: Date; timeZone: string },
): Date | null {
  const firstLine = draft.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return null;
  return parseTodoDate(firstLine, options).dueDay;
}

/** Label after "Due" on the composer chip: "Today", "Fri", "Oct 30". */
export function dueChipText(dueDay: Date, now: Date, timeZone: string): string {
  const diff = daysUntil(dueDay, now, timeZone);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return formatDay(dueDay, { weekday: "short" });
  return formatDay(dueDay, { month: "short", day: "numeric" });
}

/** Top-level todos still open in a list: pinned first, then by position. */
export function openRows(
  todos: TodoWithUrls[],
  listId: string,
  hidden: ReadonlySet<string>,
): TodoWithUrls[] {
  return todos
    .filter(
      (t) =>
        t.listId === listId &&
        t.parentId == null &&
        !t.completed &&
        !hidden.has(t.id),
    )
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
    });
}

export interface DoneGroup {
  label: string;
  items: TodoWithUrls[];
}

/** Done todos grouped by the day they were finished, newest first. */
export function groupDoneByDay(
  todos: TodoWithUrls[],
  now: Date,
  timeZone: string,
): DoneGroup[] {
  const done = todos
    .filter((t) => t.parentId == null && t.completed)
    .sort(
      (a, b) =>
        new Date(b.completedAt ?? b.updatedAt).getTime() -
        new Date(a.completedAt ?? a.updatedAt).getTime(),
    );
  const today = dayKeyIn(now, timeZone);
  const groups: DoneGroup[] = [];
  const byKey = new Map<string, DoneGroup>();
  for (const todo of done) {
    const at = new Date(todo.completedAt ?? todo.updatedAt);
    const key = dayKeyIn(at, timeZone);
    let group = byKey.get(key);
    if (!group) {
      const diff = daysBetweenKeys(key, today);
      const label =
        diff === 0
          ? "Today"
          : diff === 1
            ? "Yesterday"
            : at.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone,
              });
      group = { label, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(todo);
  }
  return groups;
}

/** The subline under a page's masthead title. */
export function mastheadSubline(
  page: PageKey,
  count: number,
  now: Date,
  timeZone: string,
): string {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-US", { ...o, timeZone });
  switch (page) {
    case "today":
      return `${fmt(now, { weekday: "long", month: "long", day: "numeric" })} · ${plural(count, "todo")}`;
    case "thisWeek": {
      const end = new Date(now.getTime() + 6 * 86_400_000);
      return `Through ${fmt(end, { weekday: "long", month: "long", day: "numeric" })} · ${plural(count, "todo")}`;
    }
    case "someday":
      return `Whenever you’re ready · ${plural(count, "todo")}`;
    case "lists":
      return `${plural(count, "list")} · never age`;
  }
}

/** System lists by kind, and the user's own lists in order. */
export function splitLists(lists: SerializedList[] | undefined): {
  byKind: Partial<Record<SystemListKind, SerializedList>>;
  collections: SerializedList[];
} {
  const byKind: Partial<Record<SystemListKind, SerializedList>> = {};
  const collections: SerializedList[] = [];
  for (const list of lists ?? []) {
    if (list.systemKind) byKind[list.systemKind] = list;
    else collections.push(list);
  }
  collections.sort((a, b) => a.position.localeCompare(b.position));
  return { byKind, collections };
}
