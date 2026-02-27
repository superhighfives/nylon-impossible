import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import type { Env } from "../types";

export interface AuthResult {
  userId: string;
}

export async function verifyClerkJWT(
  authHeader: string | null,
  env: { CLERK_SECRET_KEY: string }
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
    c.env
  );

  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", auth.userId);
  await next();
});
