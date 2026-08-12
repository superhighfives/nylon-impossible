import { and, eq, type getDb, lt, todos, users } from "./db";
import { getSystemListId } from "./lists";
import { notifySync } from "./notify-sync";

type Db = ReturnType<typeof getDb>;
type Bindings = { USER_SYNC: DurableObjectNamespace };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
 * Hourly aging sweep: for every user whose local midnight just passed,
 * demote non-completed Today items into This Week, and non-completed This
 * Week items that have sat there 7+ days into Sometime. Sometime is
 * terminal. Never touches completed todos, due dates, or custom lists.
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

    await db
      .update(todos)
      .set({ listId: thisWeekListId, listEnteredAt: now })
      .where(
        and(
          eq(todos.userId, user.id),
          eq(todos.listId, todayListId),
          eq(todos.completed, false),
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
