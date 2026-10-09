import { eq } from "drizzle-orm";
import type { DbClient } from "./db";
import { users } from "./schema";

/**
 * The user's IANA timezone from their settings, for deciding which calendar
 * day "today" is when a repeat rolls forward. Defaults to UTC, which is also
 * the column default for accounts that never set one.
 */
export async function getUserTimezone(
  db: DbClient,
  userId: string,
): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone ?? "UTC";
}
