import { eq, type getDb, users } from "./db";

type Db = ReturnType<typeof getDb>;

/**
 * The user's IANA timezone from their settings, for deciding which calendar
 * day "today" is (e.g. when a repeat rolls forward). Defaults to UTC, which
 * is also the column default for accounts that never set one.
 */
export async function getUserTimezone(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone ?? "UTC";
}
