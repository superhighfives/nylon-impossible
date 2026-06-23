import * as Sentry from "@sentry/cloudflare";
import type { Env } from "../types";
import { clerkClient } from "./clerk";
import { eq, getDb, users } from "./db";

/**
 * Remove a user from the local DB. Child tables (todos, lists, messages, urls)
 * cascade via ON DELETE constraints in the schema. Optionally also deletes the
 * Clerk user — set `deleteClerk: false` when called from a Clerk webhook where
 * the Clerk record is already gone (avoids 404 churn and idempotency loops).
 */
export async function deleteUserCascade(
  env: Env["Bindings"],
  userId: string,
  opts: { deleteClerk: boolean },
): Promise<void> {
  const db = getDb(env.DB);
  await db.delete(users).where(eq(users.id, userId));

  if (opts.deleteClerk) {
    try {
      await clerkClient(env).users.deleteUser(userId);
    } catch (error) {
      // Already-deleted Clerk users surface as 404 — safe to ignore so the
      // operation stays idempotent for retries and webhook races.
      Sentry.captureException(error, {
        tags: { area: "delete-user-clerk" },
        extra: { userId },
      });
    }
  }
}
