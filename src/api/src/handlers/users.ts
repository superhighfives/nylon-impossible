import type { Context } from "hono";
import { z } from "zod/v4";
import { eq, getDb, users } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import type { Env } from "../types";

const updatePreferencesSchema = z.object({
  aiEnabled: z.boolean().optional(),
  location: z.string().max(200).nullable().optional(),
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
      location: users.location,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return apiError(c, "user_not_found");
  }

  return c.json({
    id: user.id,
    email: user.email,
    aiEnabled: user.aiEnabled,
    location: user.location,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
}

// PATCH /users/me
export async function updateMe(c: Context<Env>) {
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = updatePreferencesSchema.safeParse(json.body);

  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const updates: Partial<{ aiEnabled: boolean; location: string | null }> = {};
  if (parsed.data.aiEnabled !== undefined) {
    updates.aiEnabled = parsed.data.aiEnabled;
  }
  if (parsed.data.location !== undefined) {
    updates.location = parsed.data.location;
  }

  if (Object.keys(updates).length === 0) {
    return apiError(c, "no_valid_fields");
  }

  await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Fetch updated user
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      aiEnabled: users.aiEnabled,
      location: users.location,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return apiError(c, "user_not_found");
  }

  return c.json({
    id: user.id,
    email: user.email,
    aiEnabled: user.aiEnabled,
    location: user.location,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
}
