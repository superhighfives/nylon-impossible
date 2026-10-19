import { verifyToken } from "@clerk/backend";
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
