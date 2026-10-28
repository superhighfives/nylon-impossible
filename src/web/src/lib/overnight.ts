import { dayKeyIn } from "@nylon-impossible/shared";
import type { LastSweep } from "@/hooks/useUser";

/** localStorage key holding the `at` of the overnight note last dismissed. */
export const OVERNIGHT_DISMISSED_KEY = "nylon:overnight-dismissed";

/**
 * The note's words: "2 moved to This week overnight", "2 moved to This week,
 * 1 to Someday overnight", "1 moved to Someday overnight". Null when the
 * sweep moved nothing.
 */
export function overnightText(sweep: LastSweep): string | null {
  const week = sweep.movedToThisWeek;
  const someday = sweep.movedToSomeday;
  if (week > 0 && someday > 0) {
    return `${week} moved to This week, ${someday} to Someday overnight`;
  }
  if (week > 0) return `${week} moved to This week overnight`;
  if (someday > 0) return `${someday} moved to Someday overnight`;
  return null;
}

/**
 * What Today's overnight note says, or null when it shouldn't show. It shows
 * when the last sweep that moved anything ran on the user's current local day
 * (in their timezone setting), until it's dismissed for that sweep or
 * anything is added to Today after it.
 */
export function overnightNote({
  sweep,
  now,
  timeZone,
  dismissedAt,
  addedToTodaySince,
}: {
  sweep: LastSweep | null | undefined;
  now: Date;
  timeZone: string;
  /** The `at` of the last dismissed note. */
  dismissedAt: string | null;
  /** Whether a todo was created in Today after `at`. */
  addedToTodaySince: (at: Date) => boolean;
}): string | null {
  if (!sweep) return null;
  const at = new Date(sweep.at);
  if (Number.isNaN(at.getTime())) return null;
  if (dismissedAt === sweep.at) return null;
  try {
    if (dayKeyIn(at, timeZone) !== dayKeyIn(now, timeZone)) return null;
  } catch {
    return null;
  }
  if (addedToTodaySince(at)) return null;
  return overnightText(sweep);
}

/** The dismissed `at`, or null. Storage can be missing or throw. */
export function readDismissedAt(): string | null {
  try {
    return window.localStorage.getItem(OVERNIGHT_DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function writeDismissedAt(at: string): void {
  try {
    window.localStorage.setItem(OVERNIGHT_DISMISSED_KEY, at);
  } catch {
    // Private mode or blocked storage: the note stays dismissed for this
    // session (the hook keeps it in state) and comes back on reload.
  }
}
