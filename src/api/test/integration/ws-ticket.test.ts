import { env } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken } from "../../src/lib/api-token";
import { eq, getDb, users, wsTickets } from "../../src/lib/db";
import { callWorker as call, cleanDb, SESSION, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

const UPGRADE = { Upgrade: "websocket" };

async function createTicket() {
  const res = await call("/ws/ticket", { method: "POST", token: SESSION });
  expect(res.status).toBe(200);
  const body = await res.json<{ ticket: string }>();
  expect(Object.keys(body)).toEqual(["ticket"]);
  return body.ticket;
}

async function connect(query: string) {
  const res = await call(`/ws${query}`, { headers: UPGRADE });
  // Close an accepted socket so the Durable Object doesn't keep it open.
  if (res.webSocket) {
    res.webSocket.accept();
    res.webSocket.close();
  }
  return res;
}

async function ticketRows() {
  return getDb(env.DB).select().from(wsTickets);
}

describe("WebSocket tickets", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  describe("POST /ws/ticket", () => {
    it("returns 401 without a session token", async () => {
      const res = await call("/ws/ticket", { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("returns 401 with an invalid session token", async () => {
      mockVerifyToken.mockRejectedValue(new Error("Invalid token"));
      const res = await call("/ws/ticket", {
        method: "POST",
        token: "bad-token",
      });
      expect(res.status).toBe(401);
    });

    it("returns a random ticket and stores only its SHA-256, for 30 seconds", async () => {
      const before = Date.now();
      const ticket = await createTicket();
      expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await createTicket()).not.toBe(ticket);

      const rows = await ticketRows();
      expect(rows).toHaveLength(2);
      const hash = await hashApiToken(ticket);
      expect(rows.find((r) => r.ticketHash === hash)?.userId).toBe(
        "user_test_123",
      );
      for (const r of rows) {
        const ttl = r.expiresAt.getTime() - before;
        expect(ttl).toBeGreaterThanOrEqual(30_000);
        expect(ttl).toBeLessThan(31_000);
      }
      expect(JSON.stringify(rows)).not.toContain(ticket);
    });

    it("sweeps tickets that have already expired", async () => {
      const db = getDb(env.DB);
      await db.insert(wsTickets).values([
        {
          ticketHash: "expired",
          userId: "user_test_123",
          expiresAt: new Date(Date.now() - 1_000),
        },
        {
          ticketHash: "live",
          userId: "user_test_123",
          expiresAt: new Date(Date.now() + 20_000),
        },
      ]);
      await createTicket();
      const hashes = (await ticketRows()).map((r) => r.ticketHash);
      expect(hashes).not.toContain("expired");
      expect(hashes).toContain("live");
      expect(hashes).toHaveLength(2);
    });
  });

  describe("GET /ws", () => {
    it("upgrades once with a ticket, and refuses it the second time", async () => {
      const ticket = await createTicket();

      const first = await connect(`?ticket=${encodeURIComponent(ticket)}`);
      expect(first.status).toBe(101);
      expect(await ticketRows()).toEqual([]);

      const second = await connect(`?ticket=${encodeURIComponent(ticket)}`);
      expect(second.status).toBe(401);
    });

    it("lets only one of two concurrent upgrades use a ticket", async () => {
      const ticket = await createTicket();
      const results = await Promise.all([
        connect(`?ticket=${ticket}`),
        connect(`?ticket=${ticket}`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([101, 401]);
    });

    it("refuses a ticket past its 30 seconds", async () => {
      const ticket = await createTicket();
      await getDb(env.DB)
        .update(wsTickets)
        .set({ expiresAt: new Date(Date.now() - 1) })
        .where(eq(wsTickets.ticketHash, await hashApiToken(ticket)));

      const res = await connect(`?ticket=${ticket}`);
      expect(res.status).toBe(401);
      // Redeeming deletes it all the same.
      expect(await ticketRows()).toEqual([]);
    });

    it("refuses an unknown ticket", async () => {
      const res = await connect("?ticket=not-a-ticket");
      expect(res.status).toBe(401);
    });

    it("refuses a request with no ticket", async () => {
      const res = await connect("");
      expect(res.status).toBe(401);
    });

    it("refuses a valid session token in ?token=", async () => {
      const res = await connect(`?token=${SESSION}`);
      expect(res.status).toBe(401);
    });

    it("returns 400 without an Upgrade header, before reading the ticket", async () => {
      const ticket = await createTicket();
      const res = await call(`/ws?ticket=${ticket}`);
      expect(res.status).toBe(400);
      // The ticket is still there to use.
      expect(await ticketRows()).toHaveLength(1);
    });
  });

  it("deleting a user deletes their tickets", async () => {
    await createTicket();
    expect(await ticketRows()).toHaveLength(1);
    await getDb(env.DB).delete(users).where(eq(users.id, "user_test_123"));
    expect(await ticketRows()).toEqual([]);
  });
});
