import { createClerkClient } from "@clerk/backend";
import { generateNKeysBetween } from "fractional-indexing";
import type { Env } from "../types";
import { eq, type getDb, lists, todos, users } from "./db";

// The three system lists provisioned for every new user, in fixed first-three
// order. Kept here because this is the single place a user row is ever created.
const SYSTEM_LISTS = [
  { name: "Today", systemKind: "today" as const },
  { name: "This Week", systemKind: "thisWeek" as const },
  { name: "Sometime", systemKind: "sometime" as const },
];

// Non-production demo data. When one of these accounts first logs into a
// preview or local dev, its freshly-provisioned app is seeded with a
// realistic set of todos so it isn't an empty shell. Matched by Clerk email
// so we don't need each account's dev-instance Clerk id, and gated to
// ENVIRONMENT !== "production" (see seedDemoTodos) so production is never
// touched.
const DEMO_SEED_EMAILS = new Set([
  "marketing@nylonimpossible.com",
  "hi@charliegleason.com",
]);

type SeedTodo = {
  list: (typeof SYSTEM_LISTS)[number]["systemKind"];
  title: string;
  notes?: string;
  completed?: boolean;
  dueInDays?: number;
};

const DEMO_SEED_TODOS: SeedTodo[] = [
  {
    list: "today",
    title: "Finish quarterly report",
    notes: "Needs sign-off from the finance team before end of month",
    dueInDays: 0,
  },
  { list: "today", title: "Buy groceries for the week", completed: true },
  { list: "thisWeek", title: "Book dentist appointment", dueInDays: 3 },
  { list: "thisWeek", title: "Reply to the design feedback thread" },
  { list: "sometime", title: "Read 'Atomic Habits'" },
  { list: "sometime", title: "Plan the autumn hiking trip" },
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

// Insert the demo todos for a just-provisioned non-production account,
// distributing DEMO_SEED_TODOS across the user's system lists with
// fractional positions in declared order. Due dates are relative to now so
// the seed never goes stale.
async function seedDemoTodos(
  db: ReturnType<typeof getDb>,
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
