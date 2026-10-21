/**
 * Due dates are calendar days, not instants. They're stored as a timestamp,
 * and the canonical form is midnight UTC of the picked day — that's what the
 * web calendar writes and what recurrence steps through.
 *
 * Every writer stores that form, so stored values are already canonical.
 * Rounding to the *nearest* UTC midnight is a guard for stray non-midnight
 * values (a local-midnight instant maps back to its day for any offset within
 * ±12h). Every reader goes through `dueDayKey` rather than reading UTC or
 * local fields directly, and writers normalize with `toDueDay`.
 */

const DAY_MS = 86_400_000;

/** The nearest UTC midnight — the canonical stored form of a due date. */
export function toDueDay(date: Date): Date {
  return new Date(Math.round(date.getTime() / DAY_MS) * DAY_MS);
}

/** A due date's calendar day as `yyyy-mm-dd`. */
export function dueDayKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return toDueDay(d).toISOString().slice(0, 10);
}

/**
 * The calendar day `now` falls on in `timeZone`, as `yyyy-mm-dd`. Falls back
 * to UTC for an unknown zone rather than throwing.
 */
export function dayKeyIn(now: Date, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  try {
    return now.toLocaleDateString("en-CA", { ...opts, timeZone });
  } catch {
    return now.toLocaleDateString("en-CA", { ...opts, timeZone: "UTC" });
  }
}

/** Whole days from day key `from` to day key `to` (positive = `to` later). */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
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
export function formatDueDay(
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
    return {
      text: formatDueDay(dueDate, { weekday: "short" }),
      overdue: false,
    };
  return {
    text: formatDueDay(dueDate, { month: "short", day: "numeric" }),
    overdue: false,
  };
}
