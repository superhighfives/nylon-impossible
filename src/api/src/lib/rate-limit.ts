import { desc } from "drizzle-orm";
import type { Context } from "hono";
import type { Env } from "../types";

type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

const buckets = new Map<string, Bucket>();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const existing = buckets.get(userId);

  if (!existing || existing.resetAt < now) {
    buckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (existing.count >= MAX_REQUESTS) {
    return false;
  } else {
    existing.count += 1;
    return true;
  }
}

export async function recordUsage(c: Context<{ Bindings: Env }>) {
  const userId = c.get("userId") as string;

  try {
    await c.env.USAGE.put(`usage:${userId}`, String(Date.now()));
  } catch (e) {
    console.error(e);
  }
}
