import { and, eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import type { SystemListKind } from "@/types/database";
import type { DbClient } from "./db";
import { lists } from "./schema";

const SYSTEM_LISTS = [
  { name: "Today", systemKind: "today" as const },
  { name: "This Week", systemKind: "thisWeek" as const },
  { name: "Sometime", systemKind: "sometime" as const },
];

/**
 * Seed the three system lists (Today/This Week/Sometime) for a user, if they
 * don't already exist. Web-only signups create their user row via
 * `ensureUserExists` rather than the API worker's `sync.ts` — this is the
 * matching provisioning step for that path, so a web-only user always has
 * somewhere for `todos.listId` to point.
 */
export async function ensureSystemLists(
  db: DbClient,
  userId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.userId, userId), eq(lists.systemKind, "today")));
  if (existing) return;

  const positions = generateNKeysBetween(null, null, SYSTEM_LISTS.length);
  await db.insert(lists).values(
    SYSTEM_LISTS.map(({ name, systemKind }, i) => ({
      userId,
      name,
      kind: "system" as const,
      systemKind,
      position: positions[i],
    })),
  );
}

/** Look up one of a user's three system list ids. */
export async function getSystemListId(
  db: DbClient,
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
  db: DbClient,
  userId: string,
  listId: string,
): Promise<string | null> {
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)));
  return list?.id ?? null;
}
