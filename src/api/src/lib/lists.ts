import { and, eq, type getDb, lists } from "./db";

type Db = ReturnType<typeof getDb>;
export type SystemListKind = "today" | "thisWeek" | "sometime" | "completed";

/**
 * Look up one of a user's system list ids (Today/This Week/Sometime/Completed).
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
  db: Db,
  userId: string,
  listId: string,
): Promise<string | null> {
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)));
  return list?.id ?? null;
}
