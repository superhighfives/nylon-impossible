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

/** Whole calendar days from `now` to `date` in `timeZone` (positive = future). */
function localDayDiff(date: Date, now: Date, timeZone: string): number {
  const key = (d: Date) =>
    d.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
  const a = new Date(`${key(date)}T00:00:00Z`).getTime();
  const b = new Date(`${key(now)}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

/**
 * Relative calendar-day label in `timeZone`: "Today", "Tomorrow", "Yesterday",
 * a weekday within the coming week ("Monday"), else an abbreviated date
 * ("8 Jul"). Powers the "Next: …" badge on completed repeating todos, so the
 * next occurrence reads at a glance rather than as a raw date.
 */
export function relativeDay(
  date: Date | string,
  timeZone: string,
  now: Date,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = localDayDiff(d, now, timeZone);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7)
    return d.toLocaleDateString(undefined, { weekday: "long", timeZone });
  return formatDate(d, timeZone, { day: "numeric", month: "short" });
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
