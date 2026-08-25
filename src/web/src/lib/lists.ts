import { DEMO_SEED_TODOS } from "@nylon-impossible/shared/demo-seed";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import type { SystemListKind } from "@/types/database";
import type { DbClient } from "./db";
import { lists, todos, todoUrls } from "./schema";

// D1 caps bound parameters at 100 per statement. The demo-todo row here sets
// 10 fields explicitly; NOT NULL columns left unset (listEnteredAt,
// needsInput, sticky) may still bind hidden default params, so budget for up
// to 13 and chunk conservatively — matches the pattern in the API worker's
// import-google-tasks.ts, which hit this same cap.
const TODO_INSERT_CHUNK_SIZE = 6;
// The demo-url row sets all 14 non-null-default-only columns explicitly, no
// hidden extras (researchId is the only omitted column, and it's nullable
// with no default).
const TODO_URL_INSERT_CHUNK_SIZE = 7;

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
 * Insert the demo todos (and any attached link previews) for a
 * just-provisioned non-production account, distributing DEMO_SEED_TODOS
 * across the user's system lists with fractional positions in declared
 * order. Due dates are relative to now so the seed never goes stale.
 * Mirrors the API worker's
 * `seedDemoTodos` (src/api/src/lib/ensure-user.ts) — kept separate since each
 * provisions users independently, but sourced from the same shared data.
 */
export async function seedDemoTodos(
  db: DbClient,
  userId: string,
  systemLists: { id: string; systemKind: string }[],
): Promise<void> {
  const now = new Date();
  const seeded = systemLists.flatMap((list) => {
    const seeds = DEMO_SEED_TODOS.filter((t) => t.list === list.systemKind);
    const positions = generateNKeysBetween(null, null, seeds.length);
    return seeds.map((t, i) => ({
      seed: t,
      row: {
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
      },
    }));
  });

  const todoRows = seeded.map(({ row }) => row);
  for (let i = 0; i < todoRows.length; i += TODO_INSERT_CHUNK_SIZE) {
    await db
      .insert(todos)
      .values(todoRows.slice(i, i + TODO_INSERT_CHUNK_SIZE));
  }

  const urlRows = seeded.flatMap(({ seed, row }) => {
    const urls = seed.urls ?? [];
    const positions = generateNKeysBetween(null, null, urls.length);
    return urls.map((u, j) => {
      const fetchStatus = u.fetchStatus ?? (u.title ? "fetched" : "pending");
      return {
        id: crypto.randomUUID(),
        todoId: row.id,
        url: u.url,
        title: u.title ?? null,
        description: u.description ?? null,
        siteName: u.siteName ?? null,
        favicon: u.favicon ?? null,
        image: u.image ?? null,
        showPreview: u.showPreview ?? true,
        position: positions[j],
        fetchStatus,
        fetchedAt: fetchStatus === "fetched" ? now : null,
        createdAt: now,
        updatedAt: now,
      };
    });
  });

  for (let i = 0; i < urlRows.length; i += TODO_URL_INSERT_CHUNK_SIZE) {
    await db
      .insert(todoUrls)
      .values(urlRows.slice(i, i + TODO_URL_INSERT_CHUNK_SIZE));
  }
}

/** Look up one of a user's system list ids (Today/This Week/Sometime/Completed). */
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
