import { and, eq, type getDb, lists } from "./db";

type Db = ReturnType<typeof getDb>;
export type SystemListKind = "today" | "thisWeek" | "sometime";

/**
 * Look up one of a user's three system list ids (Today/This Week/Sometime).
 * These are seeded for every user at account creation (`sync.ts`), so this
 * should always resolve — callers can treat a null result as a bug, not a
 * normal case to handle gracefully.
 */
export async function getSystemListId(
  db: Db,
  userId: string,
  kind: SystemListKind,
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
