import type { Context } from "hono";
import { generateApiToken, hashApiToken } from "../lib/api-token";
import { apiTokens, eq, getDb } from "../lib/db";
import { ensureUser } from "../lib/ensure-user";
import type { Env } from "../types";

// The personal API token, managed from web Settings. These routes sit behind
// authMiddleware (Clerk session tokens only), so a personal token can't mint
// or revoke one. Nothing here returns the token except the POST that made it,
// and nothing ever returns its hash.

// GET /users/me/api-token
export async function getApiToken(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const [row] = await db
    .select({
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, c.get("userId")))
    .limit(1);

  return c.json({
    token: row
      ? {
          createdAt: row.createdAt.toISOString(),
          lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        }
      : null,
  });
}

// POST /users/me/api-token: create, or replace (Regenerate). The old token
// stops working as soon as its row is replaced.
export async function createApiToken(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  // The token's row references users; provision it like /users/me does.
  await ensureUser(c.env, db, userId);

  const token = generateApiToken();
  const tokenHash = await hashApiToken(token);
  // D1 keeps seconds; match it so createdAt reads back the same.
  const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const id = crypto.randomUUID();

  await db
    .insert(apiTokens)
    .values({ id, userId, tokenHash, createdAt, lastUsedAt: null })
    .onConflictDoUpdate({
      target: apiTokens.userId,
      set: { id, tokenHash, createdAt, lastUsedAt: null },
    });

  return c.json({ token, createdAt: createdAt.toISOString() }, 201);
}

// DELETE /users/me/api-token: idempotent.
export async function deleteApiToken(c: Context<Env>) {
  const db = getDb(c.env.DB);
  await db.delete(apiTokens).where(eq(apiTokens.userId, c.get("userId")));
  return c.body(null, 204);
}
