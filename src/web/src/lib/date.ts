/**
 * Formats a date in the user's time zone (from the time-zone client hint) so the
 * calendar day is correct regardless of where the code runs — SSR on Cloudflare
 * runs in UTC, which can render the wrong day near midnight. Pass `timeZone`
 * from `useHints()`.
 */
export function formatDate(
  date: Date | string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  // timeZone last so an explicit `options.timeZone` can't silently override the
  // argument and reintroduce SSR/client day mismatches.
  return d.toLocaleDateString(undefined, { ...options, timeZone });
}

/**
 * True when two instants fall on the same calendar day in `timeZone`. Compares
 * the localized Y/M/D rather than raw timestamps, so "today" flips exactly at
 * the user's local midnight regardless of where the code runs (SSR is UTC).
 */
export function isSameLocalDay(
  a: Date | string,
  b: Date | string,
  timeZone: string,
): boolean {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  };
  return (
    da.toLocaleDateString("en-CA", opts) ===
    db.toLocaleDateString("en-CA", opts)
  );
}

/**
 * A repeating todo isn't persisted as done — completing it rolls dueDate forward
 * and stamps `completedAt`. It should read as completed (and sit in the
 * Completed section) only until the user's local midnight, after which it
 * derives back to active. `completed` (a normal, non-repeating done state) always
 * counts.
 */
export function isEffectivelyCompleted(
  todo: { completed: boolean; completedAt: string | null },
  timeZone: string,
  now: Date,
): boolean {
  if (todo.completed) return true;
  if (!todo.completedAt) return false;
  return isSameLocalDay(todo.completedAt, now, timeZone);
}
