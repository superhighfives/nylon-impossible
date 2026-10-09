/**
 * Due dates are calendar days, not instants. They're stored as a timestamp,
 * and the canonical form is midnight UTC of the picked day — that's what the
 * web calendar writes and what recurrence steps through.
 *
 * Older iOS builds wrote local midnight instead (e.g. 07:00Z for a Pacific
 * user, or 14:00Z the previous day for Sydney). Rounding to the *nearest* UTC
 * midnight recovers the intended day from either form for any offset within
 * ±12h, so every reader goes through `dueDayKey` rather than reading UTC or
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
