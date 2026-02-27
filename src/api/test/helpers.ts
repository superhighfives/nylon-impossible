import { env } from "cloudflare:test";
import { getDb, users } from "../src/lib/db";

export async function seedUser(
  userId = "user_test_123",
  email = "test@example.com",
) {
  const db = getDb(env.DB);
  await db.insert(users).values({ id: userId, email }).onConflictDoNothing();
  return userId;
}

export async function cleanDb() {
  await env.DB.exec("DELETE FROM todos");
  await env.DB.exec("DELETE FROM users");
}
