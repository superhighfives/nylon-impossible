/**
 * Typed dates: a small deterministic parser that turns "Pay rent tomorrow" into
 * the title "Pay rent" due tomorrow. No AI, no locale guessing.
 *
 * Rules (see "Interactions › Adding" in the cohesive redesign spec):
 *
 * - "today", "tonight", "tomorrow" and "tmrw" count anywhere in the text.
 * - Weekdays ("fri", "friday", optionally "on fri" / "by fri" / "due fri"),
 *   "next week" and month dates ("oct 30", "30 oct") count only at the END of
 *   the text, so "Call Mum about Sunday lunch" stays a title.
 * - A weekday equal to today means next week. "next week" means the Monday
 *   after today.
 * - A month date that has already passed this year means next year.
 * - The title is never empty: when stripping the date would leave nothing,
 *   nothing is parsed.
 *
 * Due days are calendar days, returned in the canonical stored form (midnight
 * UTC of the day — see `due-date.ts`), computed against "today" in the
 * caller's IANA time zone.
 *
 * The Swift mirror lives in `src/ios/.../Utils/TodoDateParser.swift`; both are
 * tested against `todo-date-fixtures.json`. Change the two together.
 */

import { dayKeyIn } from "./due-date";

export interface TodoDateMatch {
  /** The matched words as typed, e.g. "on fri" or "tomorrow". */
  text: string;
  /** UTF-16 offset of the match in the input. */
  start: number;
  /** UTF-16 offset just past the match. */
  end: number;
}

export interface ParsedTodoDate {
  /** The title with the date words removed (or the trimmed input if none). */
  title: string;
  /** Midnight UTC of the due calendar day, or null when nothing parsed. */
  dueDay: Date | null;
  /** The matched span, so a UI can show "Due Fri ×" and undo it. */
  matched: TodoDateMatch | null;
}

export interface ParseTodoDateOptions {
  now?: Date;
  /** IANA zone that decides which calendar day "today" is. Defaults to UTC. */
  timeZone?: string;
}

const DAY_MS = 86_400_000;

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tues: 2,
  tue: 2,
  wednesday: 3,
  weds: 3,
  wed: 3,
  thursday: 4,
  thurs: 4,
  thur: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

// Longest alternatives first so the regex never settles on a prefix.
const WEEKDAY_ALT =
  "monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun";
const MONTH_ALT =
  "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec";
const PREFIX = "(?:(?:on|by|due)\\s+)?";
const ORDINAL = "(?:st|nd|rd|th)?";

// Every pattern captures the whole date phrase in group 1. The leading
// `(?:^|\s)` keeps matches on word starts ("pre-friday" never matches).
export const TODO_DATE_PATTERNS = {
  weekday: `(?:^|\\s)(${PREFIX}(${WEEKDAY_ALT}))\\s*$`,
  nextWeek: `(?:^|\\s)(${PREFIX}next\\s+week)\\s*$`,
  monthDay: `(?:^|\\s)(${PREFIX}(${MONTH_ALT})\\s+(\\d{1,2})${ORDINAL})\\s*$`,
  dayMonth: `(?:^|\\s)(${PREFIX}(\\d{1,2})${ORDINAL}\\s+(${MONTH_ALT}))\\s*$`,
  // Not followed by a word character or apostrophe, so "today's" and
  // "tomorrowland" stay as typed.
  relative: `(?:^|\\s)((?:(?:by|due)\\s+)?(today|tonight|tomorrow|tmrw))(?![\\w'’-])`,
} as const;

const WEEKDAY_RE = new RegExp(TODO_DATE_PATTERNS.weekday, "i");
const NEXT_WEEK_RE = new RegExp(TODO_DATE_PATTERNS.nextWeek, "i");
const MONTH_DAY_RE = new RegExp(TODO_DATE_PATTERNS.monthDay, "i");
const DAY_MONTH_RE = new RegExp(TODO_DATE_PATTERNS.dayMonth, "i");
const RELATIVE_RE = new RegExp(TODO_DATE_PATTERNS.relative, "i");

/** `yyyy-mm-dd` → midnight UTC of that day. */
function keyToDay(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

/** Midnight UTC of y-m-d, or null if that day doesn't exist (Feb 30). */
function validDay(year: number, month: number, day: number): Date | null {
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? date : null;
}

interface Candidate {
  match: RegExpExecArray;
  dueDay: Date;
}

function span(match: RegExpExecArray): TodoDateMatch {
  const text = match[1];
  // Group 1 sits at the end of the full match minus any trailing whitespace.
  const start = match.index + match[0].indexOf(text);
  return { text, start, end: start + text.length };
}

function removeSpan(input: string, m: TodoDateMatch): string {
  const before = input.slice(0, m.start).trimEnd();
  const after = input.slice(m.end).trimStart();
  if (!before) return after;
  if (!after) return before;
  // "Pay rent tomorrow." → "Pay rent." rather than "Pay rent ."
  return /^[.,!?;:]/.test(after) ? `${before}${after}` : `${before} ${after}`;
}

function findCandidate(text: string, today: Date): Candidate | null {
  const weekday = WEEKDAY_RE.exec(text);
  if (weekday) {
    const target = WEEKDAYS[weekday[2].toLowerCase()];
    const ahead = (target - today.getUTCDay() + 7) % 7 || 7;
    return { match: weekday, dueDay: addDays(today, ahead) };
  }

  const nextWeek = NEXT_WEEK_RE.exec(text);
  if (nextWeek) {
    // The Monday after today (ISO weeks start on Monday).
    const ahead = (1 - today.getUTCDay() + 7) % 7 || 7;
    return { match: nextWeek, dueDay: addDays(today, ahead) };
  }

  const monthDay = MONTH_DAY_RE.exec(text);
  const dayMonth = monthDay ? null : DAY_MONTH_RE.exec(text);
  const monthMatch = monthDay ?? dayMonth;
  if (monthMatch) {
    const month =
      MONTHS[(monthDay ? monthMatch[2] : monthMatch[3]).toLowerCase()];
    const day = Number(monthDay ? monthMatch[3] : monthMatch[2]);
    const year = today.getUTCFullYear();
    let due = validDay(year, month, day);
    if (!due || due.getTime() < today.getTime()) {
      due = validDay(year + 1, month, day);
    }
    if (due) return { match: monthMatch, dueDay: due };
  }

  const relative = RELATIVE_RE.exec(text);
  if (relative) {
    const word = relative[2].toLowerCase();
    const ahead = word === "tomorrow" || word === "tmrw" ? 1 : 0;
    return { match: relative, dueDay: addDays(today, ahead) };
  }

  return null;
}

/**
 * Parse a typed date out of todo text. Returns the stripped title, the due day
 * (midnight UTC, the stored form) and the matched span; or the trimmed input
 * with `dueDay: null` when there's no date or stripping it would empty the
 * title.
 */
export function parseTodoDate(
  text: string,
  options: ParseTodoDateOptions = {},
): ParsedTodoDate {
  const trimmed = text.trim();
  const none: ParsedTodoDate = { title: trimmed, dueDay: null, matched: null };
  if (!trimmed) return none;

  const today = keyToDay(
    dayKeyIn(options.now ?? new Date(), options.timeZone ?? "UTC"),
  );
  const candidate = findCandidate(trimmed, today);
  if (!candidate) return none;

  const matched = span(candidate.match);
  const title = removeSpan(trimmed, matched).trim();
  // Never leave a title with nothing to read ("tomorrow." → ".").
  if (!/[\p{L}\p{N}]/u.test(title)) return none;

  return { title, dueDay: candidate.dueDay, matched };
}
