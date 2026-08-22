import { env } from "cloudflare:test";
import {
  and,
  eq,
  getDb,
  lists,
  todoMessages,
  todoSuggestions,
  todos,
  todoUrls,
  users,
} from "../src/lib/db";

/**
 * Seed the system lists (Today/This Week/Sometime/Completed) for a user,
 * mirroring the provisioning `ensure-user.ts` does at real account creation.
 * Idempotent — safe to call even if the lists already exist.
 */
export async function seedSystemLists(userId = "user_test_123") {
  const db = getDb(env.DB);
  const SYSTEM_LISTS = [
    { name: "Today", systemKind: "today" as const },
    { name: "This Week", systemKind: "thisWeek" as const },
    { name: "Sometime", systemKind: "sometime" as const },
    { name: "Completed", systemKind: "completed" as const },
  ];
  const [existing] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.userId, userId), eq(lists.systemKind, "today")));
  if (existing) return;

  await db.insert(lists).values(
    SYSTEM_LISTS.map(({ name, systemKind }, i) => ({
      id: crypto.randomUUID(),
      userId,
      name,
      kind: "system" as const,
      systemKind,
      position: `a${i}`,
    })),
  );
}

/** The id of a user's Today list, seeded by `seedSystemLists`. */
export async function getTodayListId(userId = "user_test_123") {
  const db = getDb(env.DB);
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.userId, userId),
        eq(lists.kind, "system"),
        eq(lists.systemKind, "today"),
      ),
    );
  if (!list) throw new Error(`No Today list seeded for user ${userId}`);
  return list.id;
}

/** The id of a user's Completed list, seeded by `seedSystemLists`. */
export async function getCompletedListId(userId = "user_test_123") {
  const db = getDb(env.DB);
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.userId, userId),
        eq(lists.kind, "system"),
        eq(lists.systemKind, "completed"),
      ),
    );
  if (!list) throw new Error(`No Completed list seeded for user ${userId}`);
  return list.id;
}

export async function seedUser(
  userId = "user_test_123",
  email = "test@example.com",
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const db = getDb(env.DB);
  // Default test users to the "pro" plan so the existing AI-path tests keep
  // exercising AI behavior. Tests that explicitly verify the free-tier gate
  // can pass `{ plan: "free" }`.
  await db
    .insert(users)
    .values({ id: userId, email, plan: "pro", ...overrides })
    .onConflictDoNothing();
  // Real account creation always seeds the system lists (ensure-user.ts) —
  // match that here so todos.listId's NOT NULL FK has somewhere to point.
  await seedSystemLists(userId);
  return userId;
}

export async function seedTodoUrl(
  todoId: string,
  url: string,
  position = "a0",
) {
  const db = getDb(env.DB);
  const [inserted] = await db
    .insert(todoUrls)
    .values({ todoId, url, position })
    .returning();
  return inserted;
}

export async function seedTodo(
  todoId: string,
  userId = "user_test_123",
  overrides: Partial<typeof todos.$inferInsert> = {},
) {
  const db = getDb(env.DB);
  const listId = overrides.listId ?? (await getTodayListId(userId));
  const [inserted] = await db
    .insert(todos)
    .values({ id: todoId, userId, title: "Test todo", ...overrides, listId })
    .returning();
  return inserted;
}

export async function seedMessage(
  todoId: string,
  overrides: Partial<typeof todoMessages.$inferInsert> = {},
) {
  const db = getDb(env.DB);
  const [inserted] = await db
    .insert(todoMessages)
    .values({
      id: crypto.randomUUID(),
      todoId,
      role: "assistant",
      content: "Where to, and when?",
      awaitingReply: true,
      ...overrides,
    })
    .returning();
  return inserted;
}

export async function seedSuggestion(
  todoId: string,
  overrides: Partial<typeof todoSuggestions.$inferInsert> = {},
) {
  const db = getDb(env.DB);
  const [inserted] = await db
    .insert(todoSuggestions)
    .values({
      id: crypto.randomUUID(),
      todoId,
      type: "title",
      payload: { title: "Buy milk" },
      label: 'Rename to "Buy milk"',
      status: "pending",
      ...overrides,
    })
    .returning();
  return inserted;
}

export async function cleanDb() {
  await env.DB.exec("DELETE FROM todo_messages");
  await env.DB.exec("DELETE FROM todo_suggestions");
  await env.DB.exec("DELETE FROM todo_urls");
  await env.DB.exec("DELETE FROM todo_research");
  await env.DB.exec("DELETE FROM todos");
  await env.DB.exec("DELETE FROM lists");
  await env.DB.exec("DELETE FROM gmail_addon_links");
  await env.DB.exec("DELETE FROM users");
}
