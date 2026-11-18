import type { Context } from "hono";
import { getDb } from "../lib/db";
import { ensureUser } from "../lib/ensure-user";
import { apiError } from "../lib/errors";
import { issueWsTicket } from "../lib/ws-ticket";
import type { Env } from "../types";

// POST /ws/ticket, behind authMiddleware: a one-use ticket for GET /ws, which
// the apps fetch before every connect and reconnect.
export async function createWsTicket(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  // The ticket's row references users; provision it like /users/me does.
  if ((await ensureUser(c.env, db, userId)) === "email_conflict") {
    return apiError(c, "email_already_registered");
  }
  return c.json({ ticket: await issueWsTicket(db, userId) });
}
