import type { Recurrence } from "./schema";

/**
 * Compute the next due date for a repeating todo: the first occurrence of the
 * recurrence rule strictly after `now`. Missed occurrences are not stored or
 * surfaced — a daily todo left unchecked for a week jumps straight to
 * tomorrow's date rather than producing a backlog of seven overdue rows.
 *
 * The Swift port lives at src/ios/Nylon Impossible/Nylon Impossible/Utils/Recurrence.swift
 * and must produce the same result for the same inputs (covered by parity
 * fixtures shared between the two test suites).
 */
export function nextDueDate(
  recurrence: Recurrence,
  from: Date,
  now: Date,
): Date {
  let next = advance(recurrence, from);
  while (next.getTime() <= now.getTime()) {
    next = advance(recurrence, next);
  }
  return next;
}

/**
 * Step a recurrence one occurrence backward from `from`. Used to undo a repeat
 * that was completed today: completing advances the dueDate, so un-checking it
 * before local midnight rolls it back to the occurrence that was current when
 * it was checked.
 *
 * Like the forward advance, monthly/yearly day-of-month clamping is lossy in
 * reverse (e.g. Feb 28 → Jan 28, not Jan 31); this matches the forward
 * behavior and is acceptable for a single-step undo. Mirrored in the Swift port.
 */
export function previousDueDate(recurrence: Recurrence, from: Date): Date {
  const prev = new Date(from.getTime());
  switch (recurrence.frequency) {
    case "daily":
      prev.setUTCDate(prev.getUTCDate() - 1);
      return prev;
    case "weekly":
      prev.setUTCDate(prev.getUTCDate() - 7);
      return prev;
    case "monthly":
      return addMonths(from, -1);
    case "yearly":
      return addMonths(from, -12);
  }
}

function advance(recurrence: Recurrence, from: Date): Date {
  const next = new Date(from.getTime());
  switch (recurrence.frequency) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "monthly":
      return addMonths(from, 1);
    case "yearly":
      return addMonths(from, 12);
  }
}

// Adds `months` calendar months while clamping the day-of-month to the target
// month's length. e.g. Jan 31 + 1 month → Feb 28 (or Feb 29 in a leap year),
// matching how most calendar apps roll forward.
function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();
  const targetMonth = month + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const daysInTarget = daysInMonth(targetYear, normalizedMonth);
  const clampedDay = Math.min(day, daysInTarget);
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      clampedDay,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
