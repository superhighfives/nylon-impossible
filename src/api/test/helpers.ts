import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { expect } from "vitest";
import worker from "../src";
import { and, eq, getDb, lists, todos, todoUrls, users } from "../src/lib/db";

/** Stands in for a Clerk session JWT; the Clerk mock accepts it. */
export const SESSION =
  "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyX3Rlc3RfMTIzIn0.sig";

/** A rate limiter that always lets the request through. */
const OPEN_LIMIT = { limit: async () => ({ success: true }) };

/**
 * Calls the worker directly rather than through SELF, so a test can swap a
 * binding (the /v1 rate limiter) and wait for `waitUntil` work (the API
 * token's last-used write) before reading D1.
 */
export async function callWorker(
  path: string,
  init: RequestInit & { token?: string } = {},
  overrides: Record<string, unknown> = {},
) {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const ctx = createExecutionContext();
  const res = await worker.fetch?.(
    new Request(`http://localhost${path}`, { ...rest, headers }) as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    { ...env, V1_RATE_LIMIT: OPEN_LIMIT, ...overrides } as never,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  if (!res) throw new Error("worker has no fetch handler");
  return res;
}

/** Makes a personal API token for the user the Clerk mock signs in. */
export async function createApiToken() {
  const res = await callWorker("/users/me/api-token", {
    method: "POST",
    token: SESSION,
  });
  expect(res.status).toBe(201);
  return res.json<{ token: string; createdAt: string }>();
}

/**
 * Seed the system lists (Today/This week/Someday) for a user,
 * mirroring the provisioning `ensure-user.ts` does at real account creation.
 * Idempotent — safe to call even if the lists already exist.
 */
export async function seedSystemLists(userId = "user_test_123") {
  const db = getDb(env.DB);
  const SYSTEM_LISTS = [
    { name: "Today", systemKind: "today" as const },
    { name: "This week", systemKind: "thisWeek" as const },
    { name: "Someday", systemKind: "someday" as const },
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

export async function seedUser(
  userId = "user_test_123",
  email = "test@example.com",
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const db = getDb(env.DB);
  await db
    .insert(users)
    .values({ id: userId, email, ...overrides })
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

export async function cleanDb() {
  await env.DB.exec("DELETE FROM api_tokens");
  await env.DB.exec("DELETE FROM todo_urls");
  await env.DB.exec("DELETE FROM todos");
  await env.DB.exec("DELETE FROM lists");
  await env.DB.exec("DELETE FROM gmail_addon_links");
  await env.DB.exec("DELETE FROM users");
}
