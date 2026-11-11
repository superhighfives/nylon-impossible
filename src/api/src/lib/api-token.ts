import {
  API_TOKEN_PATTERN,
  API_TOKEN_PREFIX,
} from "@nylon-impossible/shared/api-v1";
import * as Sentry from "@sentry/cloudflare";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { and, apiTokens, eq, getDb, isNull, lt, or } from "./db";
import { apiError } from "./errors";

/** `last_used_at` is rewritten at most this often per token. */
const LAST_USED_INTERVAL_MS = 60 * 60 * 1000;

/** `nyl_` and 32 random bytes, base64url without padding. */
export function generateApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return (
    API_TOKEN_PREFIX +
    base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  );
}

/**
 * SHA-256 hex of a token: the only form D1 keeps. The token is long and
 * random, so a fast hash is enough; no salt or slow KDF.
 */
export async function hashApiToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function unauthorized(c: Parameters<typeof apiError>[0]) {
  c.header("WWW-Authenticate", "Bearer");
  return apiError(c, "unauthorized");
}

/**
 * Auth for `/v1/*`: accepts only a personal API token, never a Clerk session
 * token (it never calls Clerk, so a JWT finds no hash). Sets `userId` and
 * `tokenId`, then applies the per-token rate limit.
 */
export const tokenMiddleware = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !API_TOKEN_PATTERN.test(token)) return unauthorized(c);

  const db = getDb(c.env.DB);
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, await hashApiToken(token)))
    .limit(1);
  if (!row) return unauthorized(c);

  c.set("userId", row.userId);
  c.set("tokenId", row.id);
  Sentry.setUser({ id: row.userId });

  const now = Date.now();
  if (
    !row.lastUsedAt ||
    now - row.lastUsedAt.getTime() >= LAST_USED_INTERVAL_MS
  ) {
    // The condition is repeated in SQL so concurrent requests write it once.
    const staleBefore = new Date(now - LAST_USED_INTERVAL_MS);
    c.executionCtx.waitUntil(
      db
        .update(apiTokens)
        .set({ lastUsedAt: new Date(now) })
        .where(
          and(
            eq(apiTokens.id, row.id),
            or(
              isNull(apiTokens.lastUsedAt),
              lt(apiTokens.lastUsedAt, staleBefore),
            ),
          ),
        )
        .then(() => undefined),
    );
  }

  const { success } = await c.env.V1_RATE_LIMIT.limit({ key: row.id });
  if (!success) {
    c.header("Retry-After", "60");
    return apiError(c, "rate_limited");
  }

  await next();
});
