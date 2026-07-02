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
      // Only swallow "already gone" — anything else (network/permission/5xx)
      // must surface so the caller can retry. The DB row is already deleted,
      // but a hard failure here means Clerk and our DB are out of sync.
      if (isClerkNotFound(error)) {
        Sentry.addBreadcrumb({
          category: "delete-user",
          message: "clerk.user.already_deleted",
          data: { userId },
          level: "info",
        });
        return;
      }
      Sentry.captureException(error, {
        tags: { area: "delete-user-clerk" },
        extra: { userId },
      });
      throw error;
    }
  }
}

function isClerkNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  return status === 404;
}
