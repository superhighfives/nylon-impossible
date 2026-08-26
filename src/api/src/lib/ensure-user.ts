import { createClerkClient } from "@clerk/backend";
import {
  DEMO_SEED_EMAILS,
  DEMO_SEED_TODOS,
} from "@nylon-impossible/shared/demo-seed";
import { generateNKeysBetween } from "fractional-indexing";
import type { Env } from "../types";
import { eq, type getDb, lists, todos, todoUrls, users } from "./db";

// D1 caps bound parameters at 100 per statement (see chunkForD1 in
// @nylon-impossible/shared/d1 for the general case). The demo-todo row here
// sets 10 fields explicitly; NOT NULL columns left unset (listEnteredAt,
// needsInput, sticky) may still bind hidden default params, so budget for up
// to 13 and chunk conservatively — matches the pattern in
// import-google-tasks.ts, which hit this same cap.
const TODO_INSERT_CHUNK_SIZE = 6;
// The demo-url row sets all 14 non-null-default-only columns explicitly, no
// hidden extras (researchId is the only omitted column, and it's nullable
// with no default).
const TODO_URL_INSERT_CHUNK_SIZE = 7;

// The system lists provisioned for every new user, in fixed order. Kept here
// because this is the single place a user row is ever created.
const SYSTEM_LISTS = [
  { name: "Today", systemKind: "today" as const },
  { name: "This Week", systemKind: "thisWeek" as const },
  { name: "Sometime", systemKind: "sometime" as const },
  { name: "Completed", systemKind: "completed" as const },
];

/**
 * Ensure a `users` row exists for a verified Clerk identity, creating it — and
 * seeding the three system lists — from Clerk on first sight.
 *
 * This is the app's on-demand provisioning fallback for the Clerk signup
 * webhook. The webhook only fires in production, so previews and local dev never
 * receive it; previews additionally authenticate against the Clerk *development*
 * instance, whose user IDs never exist in a webhook-provisioned table. Running
 * this from any authed entry point that needs a row (sync, /users/me) keeps
 * those environments working. Previews use their own isolated D1, so this never
 * writes into the production users table.
 *
 * Returns "email_conflict" when the Clerk email is already held by a *different*
 * account id (so this id legitimately still has no row); callers surface that as
 * a clean error rather than a downstream foreign-key crash.
 */
export async function ensureUser(
  env: Env["Bindings"],
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<"ok" | "email_conflict"> {
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));
  if (existingUser) return "ok";

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  // RETURNING tells us whether THIS call actually inserted the row. The
  // users.email unique index means the insert no-ops when the email already
  // belongs to a different auth id (or when Clerk gave us no email and a prior
  // emailless user already holds the ""). Knowing we inserted lets us seed the
  // default lists exactly once — never again on a concurrent-provision race.
  const [inserted] = await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoNothing()
    .returning({ id: users.id });

  if (inserted) {
    const positions = generateNKeysBetween(null, null, SYSTEM_LISTS.length);
    const now = new Date();
    const systemLists = SYSTEM_LISTS.map(({ name, systemKind }, i) => ({
      id: crypto.randomUUID(),
      userId,
      name,
      kind: "system" as const,
      systemKind,
      position: positions[i],
      createdAt: now,
      updatedAt: now,
    }));
    await db.insert(lists).values(systemLists);

    if (
      env.ENVIRONMENT !== "production" &&
      DEMO_SEED_EMAILS.has(email.toLowerCase())
    ) {
      await seedDemoTodos(db, userId, systemLists);
    }
    return "ok";
  }

  // Insert no-op. Either a concurrent provision already created this exact user
  // (fine — proceed), or the email is owned by a *different* account id, in which
  // case this userId has no row.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));
  return existing ? "ok" : "email_conflict";
}

// Insert the demo todos (and any attached link previews) for a
// just-provisioned non-production account, distributing DEMO_SEED_TODOS
// across the user's system lists with fractional positions in declared
// order. Due dates are relative to now so the seed never goes stale.
async function seedDemoTodos(
  db: ReturnType<typeof getDb>,
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
