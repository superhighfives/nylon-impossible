import { and, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { BoardTimeKind } from "./board-path";
import { lists, users } from "./schema";

/**
 * Any async SQLite drizzle client that can `select`: the web's
 * `drizzle(db, { schema })` and the API's schema-less `drizzle(d1)` both fit,
 * so neither app casts to call these.
 */
export type QueryDb = Pick<BaseSQLiteDatabase<"async", unknown>, "select">;

/**
 * Look up one of a user's system list ids (Today/This week/Someday).
 * These are seeded for every user at account creation (`ensure-user.ts`), so
 * this should always resolve — callers can treat a null result as a bug, not
 * a normal case to handle gracefully.
 */
export async function getSystemListId(
  db: QueryDb,
  userId: string,
  kind: BoardTimeKind,
): Promise<string | null> {
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.userId, userId),
        eq(lists.kind, "system"),
        eq(lists.systemKind, kind),
      ),
    );
  return list?.id ?? null;
}

/**
 * Verify a client-supplied `listId` actually belongs to `userId` before it's
 * written onto a todo. `listId` only ever passes a UUID-format check at the
 * request boundary — without this, an authenticated user could point their
 * own todo at another user's list id (a leaked/guessed UUID), which stays
 * invisible to them (all reads filter by `todos.userId`) but cascade-deletes
 * the moment the *other* user deletes that list. Returns the id back for a
 * convenient `??`/ternary at the call site, or null if it isn't owned by
 * `userId`.
 */
export async function verifyListOwnership(
  db: QueryDb,
  userId: string,
  listId: string,
): Promise<string | null> {
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)));
  return list?.id ?? null;
}

/**
 * The user's IANA timezone from their settings, for deciding which calendar
 * day "today" is (e.g. when a repeat rolls forward). Defaults to UTC, which
 * is also the column default for accounts that never set one.
 */
export async function getUserTimezone(
  db: QueryDb,
  userId: string,
): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone ?? "UTC";
}
