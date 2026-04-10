import { verifyToken } from "@clerk/backend";
import * as Sentry from "@sentry/cloudflare";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { eq, getDb, users } from "./db";

export interface AuthResult {
  userId: string;
}

export async function verifyClerkJWT(
  authHeader: string | null,
  env: { CLERK_SECRET_KEY: string },
): Promise<AuthResult | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    if (!payload.sub) {
      return null;
    }

    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const auth = await verifyClerkJWT(
    c.req.header("Authorization") ?? null,
    c.env,
  );

  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", auth.userId);
  Sentry.setUser({ id: auth.userId });

  // Load user preferences
  const db = getDb(c.env.DB);
  const user = await db
    .select({ aiEnabled: users.aiEnabled })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1)
    .then((rows) => rows[0]);

  c.set("aiEnabled", user?.aiEnabled ?? true);

  await next();
});
