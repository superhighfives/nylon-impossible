import { hashApiToken } from "./api-token";
import { type Db, eq, lt, wsTickets } from "./db";

// One-use tickets for GET /ws, so a Clerk session token never goes in the
// WebSocket URL (RFC 9700 §2.1). D1 keeps only each ticket's SHA-256, hashed
// as personal API tokens are.

/** How long a ticket can wait before it's redeemed. */
export const WS_TICKET_TTL_MS = 30_000;

/** 32 random bytes, base64url without padding. */
function generateTicket(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Issues a ticket for `userId`, and sweeps every ticket already past its
 * expiry, so the table stays small without a cron.
 */
export async function issueWsTicket(db: Db, userId: string): Promise<string> {
  const ticket = generateTicket();
  const now = Date.now();
  await db.batch([
    db.delete(wsTickets).where(lt(wsTickets.expiresAt, new Date(now))),
    db.insert(wsTickets).values({
      ticketHash: await hashApiToken(ticket),
      userId,
      expiresAt: new Date(now + WS_TICKET_TTL_MS),
    }),
  ]);
  return ticket;
}

/**
 * Redeems a ticket: deletes its row and returns the user it was issued to, or
 * null if it's unknown, already used or expired. The delete is the one atomic
 * step, so a ticket works at most once, even under concurrent upgrades.
 */
export async function redeemWsTicket(
  db: Db,
  ticket: string | undefined,
): Promise<string | null> {
  if (!ticket) return null;
  const [row] = await db
    .delete(wsTickets)
    .where(eq(wsTickets.ticketHash, await hashApiToken(ticket)))
    .returning({ userId: wsTickets.userId, expiresAt: wsTickets.expiresAt });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row.userId;
}
