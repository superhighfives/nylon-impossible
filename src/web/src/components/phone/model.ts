/**
 * Pure helpers behind the phone layout: page order, row meta formatting,
 * composer submission planning, and Done-history grouping. Kept free of React
 * so they're cheap to unit test (see `__tests__/model.test.ts`).
 */
import {
  BOARD_TIME_KINDS,
  type BoardView,
  type DueLabel,
  dayKeyIn,
  daysBetweenKeys,
  daysUntil,
  dueLabel,
  formatDueDay as formatDay,
  parseTodoDate,
  type Recurrence,
} from "@nylon-impossible/shared";
import {
  getFetchedPreviewTitle,
  isPlaceholderTitle,
  placeholderTitleForUrl,
  stripLinkedUrlsFromTitle,
} from "@/lib/url-display";
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

// The due label is shared with the Gmail card, so it lives in shared.
export { type DueLabel, daysUntil, dueLabel };

const REPEAT_LABELS: Record<Recurrence["frequency"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function repeatLabel(recurrence: Recurrence): string {
  return REPEAT_LABELS[recurrence.frequency];
}

/**
 * The title a row shows. A todo captured as a bare link reads as the fetched
 * page title (or "Check {domain}" until it arrives) instead of the raw URL,
 * and a URL that's attached as a link isn't repeated inside the title — the
 * meta line and the detail's link card carry it.
 */
export function displayTitle(todo: TodoWithUrls): string {
  const urls = todo.urls;
  const only = urls.length === 1 ? urls[0] : undefined;
  if (only && isPlaceholderTitle(todo.title, only.url)) {
    return (
      (only.showPreview ? getFetchedPreviewTitle(only) : null) ??
      placeholderTitleForUrl(only.url)
    );
  }
  return stripLinkedUrlsFromTitle(todo.title, urls) || todo.title;
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
  | { kind: "link"; text: string; fetching?: boolean };

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
  if (firstLink) {
    parts.push({
      kind: "link",
      text: linkDomain(firstLink.url),
      fetching: firstLink.fetchStatus === "pending",
    });
  }
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
  /** The line as typed, handed back to the composer if it fails to save. */
  line: string;
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
      if (options.keepDateWords) return { text: line, dueDay: null, line };
      const parsed = parseTodoDate(line, {
        now: options.now,
        timeZone: options.timeZone,
      });
      return parsed.dueDay
        ? { text: parsed.title, dueDay: parsed.dueDay, line }
        : { text: line, dueDay: null, line };
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

/**
 * A view's identity once lists are known: "today", "thisWeek", "someday",
 * "lists" or "list:<id>". `/` is Today, and `/list/<id>` of a time list is
 * that time list, so two URLs for the same place compare equal.
 */
export function boardViewKey(
  view: BoardView | null | undefined,
  lists: SerializedList[] | undefined,
): string {
  if (!view) return "today";
  if (view.kind !== "list") return view.kind;
  const kind = lists?.find((l) => l.id === view.id)?.systemKind;
  return kind ?? `list:${view.id}`;
}

/** The view for a `boardViewKey`, or null for a key that names no view. */
export function viewForKey(key: string): BoardView | null {
  if (key.startsWith("list:")) return { kind: "list", id: key.slice(5) };
  if (key === "lists") return { kind: "lists" };
  const kind = BOARD_TIME_KINDS.find((k) => k === key);
  return kind ? { kind } : null;
}

const DAY_MS = 86_400_000;

/** Midnight UTC of the day `offset` days from today in `timeZone`. */
export function dayFromToday(
  now: Date,
  timeZone: string,
  offset: number,
): Date {
  const today = new Date(`${dayKeyIn(now, timeZone)}T00:00:00.000Z`);
  return new Date(today.getTime() + offset * DAY_MS);
}

/** Days until the next `weekday` (0–6), never 0: today's weekday means next week. */
export function daysToWeekday(
  now: Date,
  timeZone: string,
  weekday: number,
): number {
  const today = dayFromToday(now, timeZone, 0).getUTCDay();
  const diff = (weekday - today + 7) % 7;
  return diff === 0 ? 7 : diff;
}

export interface DueChoice {
  label: string;
  day: Date | null;
}

/**
 * The quick due choices the detail's Due chip and the context menu's Due…
 * both offer: Today, Tomorrow, Friday, Next week, No date.
 */
export function dueChoices(now: Date, timeZone: string): DueChoice[] {
  return [
    { label: "Today", day: dayFromToday(now, timeZone, 0) },
    { label: "Tomorrow", day: dayFromToday(now, timeZone, 1) },
    {
      label: "Friday",
      day: dayFromToday(now, timeZone, daysToWeekday(now, timeZone, 5)),
    },
    {
      label: "Next week",
      day: dayFromToday(now, timeZone, daysToWeekday(now, timeZone, 1)),
    },
    { label: "No date", day: null },
  ];
}

/**
 * The muted line under a wide column's title. Counts live in the sidebar, so
 * unlike the phone masthead it's only the horizon: "Sunday, October 18",
 * "Through Saturday, October 24", "Whenever you’re ready", "List · never
 * ages".
 */
export function columnSubline(
  kind: SystemListKind | null,
  now: Date,
  timeZone: string,
): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone,
    });
  switch (kind) {
    case "today":
      return fmt(now);
    case "thisWeek":
      return `Through ${fmt(new Date(now.getTime() + 6 * DAY_MS))}`;
    case "someday":
      return "Whenever you’re ready";
    default:
      return "List · never ages";
  }
}
