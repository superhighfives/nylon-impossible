import { env } from "cloudflare:test";
import { getDb, todoMessages, todos, todoUrls, users } from "../src/lib/db";

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
  const [inserted] = await db
    .insert(todos)
    .values({ id: todoId, userId, title: "Test todo", ...overrides })
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

export async function cleanDb() {
  await env.DB.exec("DELETE FROM todo_messages");
  await env.DB.exec("DELETE FROM todo_urls");
  await env.DB.exec("DELETE FROM todo_research");
  await env.DB.exec("DELETE FROM todos");
  await env.DB.exec("DELETE FROM users");
}
