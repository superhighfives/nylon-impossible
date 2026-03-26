import type { Context } from "hono";
import { z } from "zod/v4";
import { eq, getDb, users } from "../lib/db";
import type { Env } from "../types";

const updatePreferencesSchema = z.object({
  aiEnabled: z.boolean().optional(),
});

// GET /users/me
export async function getMe(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const user = await db
    .select({
      id: users.id,
      email: users.email,
      aiEnabled: users.aiEnabled,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    aiEnabled: user.aiEnabled,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
}

// PATCH /users/me
export async function updateMe(c: Context<Env>) {
  const body = await c.req.json();
  const parsed = updatePreferencesSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const updates: Partial<{ aiEnabled: boolean }> = {};
  if (parsed.data.aiEnabled !== undefined) {
    updates.aiEnabled = parsed.data.aiEnabled;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  // Fetch updated user
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      aiEnabled: users.aiEnabled,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    aiEnabled: user.aiEnabled,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
}
