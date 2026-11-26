import { verifyToken } from "@clerk/backend";
import { API_TOKEN_PREFIX } from "@nylon-impossible/shared/api-v1";
import * as Sentry from "@sentry/cloudflare";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { apiError } from "./errors";

export interface AuthResult {
  userId: string;
  role: "admin" | null;
}

function extractRole(payload: Record<string, unknown>): "admin" | null {
  const metadata = payload.public_metadata ?? payload.publicMetadata;
  if (metadata && typeof metadata === "object" && "role" in metadata) {
    const role = (metadata as { role?: unknown }).role;
    if (role === "admin") return "admin";
  }
  return null;
}

export async function verifyClerkJWT(
  authHeader: string | null,
  env: { CLERK_SECRET_KEY: string },
): Promise<AuthResult | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  // A personal API token only reads /v1. Clerk would reject it anyway (it
  // isn't a JWT); this keeps the apps' routes closed to it without relying
  // on that.
  if (token.startsWith(API_TOKEN_PREFIX)) {
    return null;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    if (!payload.sub) {
      return null;
    }

    return {
      userId: payload.sub,
      role: extractRole(payload as unknown as Record<string, unknown>),
    };
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
    return apiError(c, "unauthorized");
  }

  // Per-user rate limit for every signed-in route, after the token verifies
  // (an unverified one never reaches D1). /v1 has its own, per token. It's a
  // guard, not auth, so if the binding itself fails the request goes through
  // (and the failure goes to Sentry) instead of every signed-in route 500ing.
  const success = await c.env.USER_RATE_LIMIT.limit({ key: auth.userId }).then(
    (outcome) => outcome.success,
    (error) => {
      Sentry.captureException(error, { tags: { area: "user-rate-limit" } });
      return true;
    },
  );
  if (!success) {
    c.header("Retry-After", "60");
    return apiError(c, "rate_limited");
  }

  c.set("userId", auth.userId);
  c.set("role", auth.role);
  Sentry.setUser({ id: auth.userId });

  await next();
});

export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  if (c.get("role") !== "admin") {
    return apiError(c, "forbidden");
  }
  await next();
});
