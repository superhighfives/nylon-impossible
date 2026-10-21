import { isValidTimeZone } from "@nylon-impossible/shared";
import type { Context } from "hono";
import { z } from "zod/v4";
import { eq, getDb, users } from "../lib/db";
import { deleteUserCascade } from "../lib/delete-user";
import { ensureUser } from "../lib/ensure-user";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import type { Env } from "../types";

const updatePreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine(isValidTimeZone, "timezone must be an IANA time zone")
    .optional(),
  // false once a zone is picked by hand; true hands it back to the device.
  timezoneAuto: z.boolean().optional(),
});

const userColumns = {
  id: users.id,
  email: users.email,
  theme: users.theme,
  timezone: users.timezone,
  timezoneAuto: users.timezoneAuto,
  lastSweepAt: users.lastSweepAt,
  lastSweepMovedToThisWeek: users.lastSweepMovedToThisWeek,
  lastSweepMovedToSomeday: users.lastSweepMovedToSomeday,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function serializeUser(user: {
  id: string;
  email: string;
  theme: "light" | "dark" | "system";
  timezone: string;
  timezoneAuto: boolean;
  lastSweepAt: Date | null;
  lastSweepMovedToThisWeek: number;
  lastSweepMovedToSomeday: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    theme: user.theme,
    timezone: user.timezone,
    timezoneAuto: user.timezoneAuto,
    // The last aging sweep that moved anything, for Today's overnight note.
    // Null until one has.
    lastSweep: user.lastSweepAt
      ? {
          at: user.lastSweepAt.toISOString(),
          movedToThisWeek: user.lastSweepMovedToThisWeek,
          movedToSomeday: user.lastSweepMovedToSomeday,
        }
      : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

// GET /users/me
export async function getMe(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  // Provision the row on first sight. The Clerk signup webhook only fires in
  // production; previews (which authenticate against the Clerk dev instance) and
  // local dev rely on this fallback so /users/me doesn't 404 on a fresh login.
  // Shared with /todos/sync — see ensureUser.
  await ensureUser(c.env, db, userId);

  const user = await db
    .select(userColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return apiError(c, "user_not_found");
  }

  return c.json(serializeUser(user));
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

  const updates: Partial<{
    theme: "light" | "dark" | "system";
    timezone: string;
    timezoneAuto: boolean;
  }> = {};
  if (parsed.data.theme !== undefined) {
    updates.theme = parsed.data.theme;
  }
  if (parsed.data.timezone !== undefined) {
    updates.timezone = parsed.data.timezone;
  }
  if (parsed.data.timezoneAuto !== undefined) {
    updates.timezoneAuto = parsed.data.timezoneAuto;
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
    .select(userColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return apiError(c, "user_not_found");
  }

  return c.json(serializeUser(user));
}

// DELETE /users/me
export async function deleteMe(c: Context<Env>) {
  const userId = c.get("userId");
  await deleteUserCascade(c.env, userId, { deleteClerk: true });
  return c.json({ deleted: true });
}
