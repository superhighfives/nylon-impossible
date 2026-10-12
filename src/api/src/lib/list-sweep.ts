import { and, eq, type getDb, lt, lte, todos, users } from "./db";
import { getSystemListId } from "./lists";
import { notifySync } from "./notify-sync";

type Db = ReturnType<typeof getDb>;
type Bindings = { USER_SYNC: DurableObjectNamespace };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * True when it's currently the midnight hour (00:xx) in `timezone`. The
 * sweep runs hourly on the hour, so checking "is the local hour 0 right now"
 * is equivalent to "did local midnight fall within the last hour" — no need
 * to persist a per-user last-run timestamp.
 */
export function isLocalMidnightHour(timezone: string, now: Date): boolean {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    // "24" is midnight in some locales/environments for hour12: false at the
    // hour boundary; normalize alongside "0".
    return hour === "0" || hour === "00" || hour === "24";
  } catch {
    // Invalid/unknown IANA identifier — never sweep this user rather than
    // guessing, so a bad timezone value can't silently demote todos at the
    // wrong time.
    return false;
  }
}

/**
 * The local midnight that started the current hour's day in `timezone`, as
 * an instant. Only meaningful during the midnight hour, where it's `now`
 * minus the local minutes and seconds past 00:00. Anchoring to midnight
 * rather than `now` keeps the sweep's cutoffs independent of when in the
 * hour the cron fires (or a retry re-runs) — half-hour-offset zones are
 * swept at 00:30 local, not 00:00.
 */
export function localMidnight(timezone: string, now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    minute: "numeric",
    second: "numeric",
  }).formatToParts(now);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  return new Date(
    now.getTime() - (minute * 60 + second) * 1000 - now.getMilliseconds(),
  );
}

/**
 * Hourly aging sweep. For every user whose local midnight just passed:
 *
 * - Today → This Week: non-completed todos that entered Today at least 24
 *   hours before this midnight. So a todo moves at the first midnight that's
 *   24+ hours after it arrived — added 4am Tuesday or 8pm Tuesday, it stays
 *   through Wednesday and moves at the midnight ending Wednesday. Something
 *   added late in the day still gets a full day in Today.
 * - This Week → Sometime: non-completed todos that have sat in This Week
 *   for 7+ days.
 *
 * Sometime is terminal. Never touches completed todos, due dates, or custom
 * lists. Every list move stamps `listEnteredAt`, so moving a todo back into
 * Today restarts its 24 hours.
 */
export async function runListSweep(
  db: Db,
  env: Bindings,
  now: Date,
): Promise<void> {
  const allUsers = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users);

  const dueUsers = allUsers.filter((u) => isLocalMidnightHour(u.timezone, now));
  if (dueUsers.length === 0) return;

  const weekAgo = new Date(now.getTime() - WEEK_MS);

  for (const user of dueUsers) {
    const [todayListId, thisWeekListId] = await Promise.all([
      getSystemListId(db, user.id, "today"),
      getSystemListId(db, user.id, "thisWeek"),
    ]);
    if (!todayListId || !thisWeekListId) continue;

    const todayCutoff = new Date(
      localMidnight(user.timezone, now).getTime() - DAY_MS,
    );

    await db
      .update(todos)
      .set({ listId: thisWeekListId, listEnteredAt: now })
      .where(
        and(
          eq(todos.userId, user.id),
          eq(todos.listId, todayListId),
          eq(todos.completed, false),
          lte(todos.listEnteredAt, todayCutoff),
        ),
      );

    const sometimeListId = await getSystemListId(db, user.id, "sometime");
    if (sometimeListId) {
      await db
        .update(todos)
        .set({ listId: sometimeListId, listEnteredAt: now })
        .where(
          and(
            eq(todos.userId, user.id),
            eq(todos.listId, thisWeekListId),
            eq(todos.completed, false),
            lt(todos.listEnteredAt, weekAgo),
          ),
        );
    }

    // Best-effort — a user due for the sweep may have had nothing to demote,
    // but poking connected clients is cheap and never fails the sweep itself.
    await notifySync(env, user.id);
  }
}
