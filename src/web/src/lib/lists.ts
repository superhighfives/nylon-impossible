import { DEMO_SEED_TODOS } from "@nylon-impossible/shared/demo-seed";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import type { SystemListKind } from "@/types/database";
import type { DbClient } from "./db";
import { lists, todos } from "./schema";

const SYSTEM_LISTS = [
  { name: "Today", systemKind: "today" as const },
  { name: "This Week", systemKind: "thisWeek" as const },
  { name: "Sometime", systemKind: "sometime" as const },
  { name: "Completed", systemKind: "completed" as const },
];

/**
 * Seed the system lists (Today/This Week/Sometime/Completed) for a user, if
 * they don't already exist. Web-only signups create their user row via
 * `ensureUserExists` rather than the API worker's `sync.ts` — this is the
 * matching provisioning step for that path, so a web-only user always has
 * somewhere for `todos.listId` to point.
 *
 * Returns the newly-created lists, or `null` if they already existed — lets
 * the caller seed demo todos exactly once, the same "did this call actually
 * insert" signal the API worker's `ensureUser` uses.
 */
export async function ensureSystemLists(
  db: DbClient,
  userId: string,
): Promise<{ id: string; systemKind: string }[] | null> {
  const [existing] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.userId, userId), eq(lists.systemKind, "today")));
  if (existing) return null;

  const positions = generateNKeysBetween(null, null, SYSTEM_LISTS.length);
  const inserted = await db
    .insert(lists)
    .values(
      SYSTEM_LISTS.map(({ name, systemKind }, i) => ({
        userId,
        name,
        kind: "system" as const,
        systemKind,
        position: positions[i],
      })),
    )
    .returning({ id: lists.id, systemKind: lists.systemKind });
  // systemKind is nullable on the column (custom lists have none), but every
  // row inserted above is one of SYSTEM_LISTS, which always sets it.
  return inserted.map((l) => ({
    id: l.id,
    systemKind: l.systemKind as string,
  }));
}

/**
 * Insert the demo todos for a just-provisioned non-production account,
 * distributing DEMO_SEED_TODOS across the user's system lists with
 * fractional positions in declared order. Due dates are relative to now so
 * the seed never goes stale. Mirrors the API worker's
 * `seedDemoTodos` (src/api/src/lib/ensure-user.ts) — kept separate since each
 * provisions users independently, but sourced from the same shared data.
 */
export async function seedDemoTodos(
  db: DbClient,
  userId: string,
  systemLists: { id: string; systemKind: string }[],
): Promise<void> {
  const now = new Date();
  const rows = systemLists.flatMap((list) => {
    const seeds = DEMO_SEED_TODOS.filter((t) => t.list === list.systemKind);
    const positions = generateNKeysBetween(null, null, seeds.length);
    return seeds.map((t, i) => ({
      id: crypto.randomUUID(),
      userId,
      listId: list.id,
      title: t.title,
      notes: t.notes ?? null,
      completed: t.completed ?? false,
      position: positions[i],
      dueDate:
        t.dueInDays === undefined
          ? null
          : new Date(now.getTime() + t.dueInDays * 86_400_000),
      createdAt: now,
      updatedAt: now,
    }));
  });

  if (rows.length > 0) await db.insert(todos).values(rows);
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
 *
 * Also excludes the `completed` system list: no todo's `listId` is ever
 * meant to point there (its contents are a synthesized aggregate, not a real
 * scope — see the migration that created it), so a todo pointed at it would
 * silently vanish from every UI. Custom lists have a null `systemKind`, so
 * that case must stay eligible.
 */
export async function verifyListOwnership(
  db: DbClient,
  userId: string,
  listId: string,
): Promise<string | null> {
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.id, listId),
        eq(lists.userId, userId),
        or(isNull(lists.systemKind), ne(lists.systemKind, "completed")),
      ),
    );
  return list?.id ?? null;
}
