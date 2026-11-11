import { env } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken } from "../../src/lib/api-token";
import { apiTokens, eq, getDb, users } from "../../src/lib/db";
import {
  callWorker as call,
  cleanDb,
  createApiToken as createToken,
  SESSION,
  seedUser,
} from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

async function tokenRows(userId = "user_test_123") {
  return getDb(env.DB)
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId));
}

describe("personal API token", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  describe("managing it", () => {
    it("GET says there's none before one is made", async () => {
      const res = await call("/users/me/api-token", { token: SESSION });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ token: null });
    });

    it("POST returns a nyl_ token once and stores only its SHA-256", async () => {
      const { token, createdAt } = await createToken();
      expect(token).toMatch(/^nyl_[A-Za-z0-9_-]{43}$/);
      expect(token).toHaveLength(47);

      const [row] = await tokenRows();
      expect(row.tokenHash).toBe(await hashApiToken(token));
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.createdAt.toISOString()).toBe(createdAt);
      expect(row.lastUsedAt).toBeNull();

      // The token itself appears nowhere in D1.
      const { results } = await env.DB.prepare(
        "SELECT * FROM api_tokens",
      ).all();
      expect(JSON.stringify(results)).not.toContain(token);
      expect(JSON.stringify(results)).not.toContain(token.slice(4));
    });

    it("GET returns the dates, never the token or its hash", async () => {
      const { token, createdAt } = await createToken();
      const res = await call("/users/me/api-token", { token: SESSION });
      const body = await res.json();
      expect(body).toEqual({ token: { createdAt, lastUsedAt: null } });
      const text = JSON.stringify(body);
      expect(text).not.toContain(token);
      expect(text).not.toContain(await hashApiToken(token));
    });

    it("a second POST replaces the token, and the old one gets 401", async () => {
      const first = await createToken();
      expect((await call("/v1/lists", { token: first.token })).status).toBe(
        200,
      );

      const second = await createToken();
      expect(second.token).not.toBe(first.token);
      expect(await tokenRows()).toHaveLength(1);

      const old = await call("/v1/lists", { token: first.token });
      expect(old.status).toBe(401);
      expect((await call("/v1/lists", { token: second.token })).status).toBe(
        200,
      );
    });

    it("Regenerate resets last used", async () => {
      const first = await createToken();
      await call("/v1/lists", { token: first.token });
      expect((await tokenRows())[0].lastUsedAt).not.toBeNull();

      await createToken();
      expect((await tokenRows())[0].lastUsedAt).toBeNull();
    });

    it("DELETE revokes it, and is 204 when there's nothing to delete", async () => {
      const { token } = await createToken();
      const del = await call("/users/me/api-token", {
        method: "DELETE",
        token: SESSION,
      });
      expect(del.status).toBe(204);
      expect(await tokenRows()).toHaveLength(0);
      expect((await call("/v1/lists", { token })).status).toBe(401);

      const again = await call("/users/me/api-token", {
        method: "DELETE",
        token: SESSION,
      });
      expect(again.status).toBe(204);
    });

    it("deleting the user deletes their token", async () => {
      await createToken();
      expect(await tokenRows()).toHaveLength(1);
      await getDb(env.DB).delete(users).where(eq(users.id, "user_test_123"));
      expect(await tokenRows()).toHaveLength(0);
    });
  });

  describe("kept apart from session tokens", () => {
    it("/v1 rejects a Clerk session token without asking Clerk", async () => {
      await createToken();
      mockVerifyToken.mockClear();
      const res = await call("/v1/lists", { token: SESSION });
      expect(res.status).toBe(401);
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    describe("the apps' routes reject a personal token", () => {
      let token: string;
      beforeEach(async () => {
        ({ token } = await createToken());
        // Like Clerk: anything that isn't a JWT fails verification.
        mockVerifyToken.mockImplementation(async (t: string) => {
          if (t.split(".").length !== 3) throw new Error("not a JWT");
          return { sub: "user_test_123" };
        });
      });

      it.each([
        ["GET", "/lists"],
        ["GET", "/todos"],
        ["GET", "/users/me"],
        ["GET", "/users/me/api-token"],
        ["POST", "/users/me/api-token"],
        ["DELETE", "/users/me/api-token"],
      ])("%s %s", async (method, path) => {
        const res = await call(path, { method, token });
        expect(res.status).toBe(401);
      });

      it("/ws", async () => {
        const res = await call(`/ws?token=${encodeURIComponent(token)}`, {
          headers: { Upgrade: "websocket" },
        });
        expect(res.status).toBe(401);
      });

      it("even when Clerk would accept anything", async () => {
        mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
        expect((await call("/lists", { token })).status).toBe(401);
        expect(
          (await call("/users/me/api-token", { method: "POST", token })).status,
        ).toBe(401);
      });
    });
  });

  describe("auth on /v1", () => {
    it.each([
      ["missing", undefined],
      ["malformed", "nyl_short"],
      ["not a bearer token", null],
      ["unknown", `nyl_${"A".repeat(43)}`],
    ])(
      "a %s token gets 401 unauthorized with WWW-Authenticate",
      async (_, token) => {
        const headers: HeadersInit =
          token === null ? { Authorization: "Basic abc" } : {};
        const res = await call("/v1/lists", {
          token: token ?? undefined,
          headers,
        });
        expect(res.status).toBe(401);
        expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
        expect(await res.json()).toEqual({
          error: "Unauthorized",
          code: "unauthorized",
        });
      },
    );

    it("sets last used on first use, and not again within the hour", async () => {
      const { token } = await createToken();
      expect((await tokenRows())[0].lastUsedAt).toBeNull();

      await call("/v1/lists", { token });
      const first = (await tokenRows())[0].lastUsedAt;
      expect(first).not.toBeNull();

      // Pretend it was used 30 minutes ago: a request now leaves it alone.
      const halfHourAgo = new Date(
        Math.floor(Date.now() / 1000) * 1000 - 30 * 60 * 1000,
      );
      await getDb(env.DB)
        .update(apiTokens)
        .set({ lastUsedAt: halfHourAgo })
        .where(eq(apiTokens.userId, "user_test_123"));
      await call("/v1/lists", { token });
      expect((await tokenRows())[0].lastUsedAt).toEqual(halfHourAgo);

      // Two hours ago: the next request moves it up.
      const twoHoursAgo = new Date(halfHourAgo.getTime() - 90 * 60 * 1000);
      await getDb(env.DB)
        .update(apiTokens)
        .set({ lastUsedAt: twoHoursAgo })
        .where(eq(apiTokens.userId, "user_test_123"));
      await call("/v1/lists", { token });
      const bumped = (await tokenRows())[0].lastUsedAt;
      expect(bumped?.getTime()).toBeGreaterThan(halfHourAgo.getTime());
    });
  });

  describe("rate limit", () => {
    it("the 61st request in a minute gets 429 rate_limited with Retry-After", async () => {
      const { token } = await createToken();
      const counts = new Map<string, number>();
      const limiter = {
        limit: vi.fn(async ({ key }: { key: string }) => {
          const n = (counts.get(key) ?? 0) + 1;
          counts.set(key, n);
          return { success: n <= 60 };
        }),
      };

      for (let i = 0; i < 60; i++) {
        const res = await call(
          "/v1/lists",
          { token },
          { V1_RATE_LIMIT: limiter },
        );
        expect(res.status).toBe(200);
      }
      const res = await call(
        "/v1/lists",
        { token },
        { V1_RATE_LIMIT: limiter },
      );
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
      expect(await res.json()).toEqual({
        error: "Too many requests. Try again in a minute.",
        code: "rate_limited",
      });

      // Keyed on the token's id, not the user or the token itself.
      const [row] = await tokenRows();
      expect(limiter.limit).toHaveBeenLastCalledWith({ key: row.id });
    });

    it("isn't counted for a request without a valid token", async () => {
      const limiter = { limit: vi.fn(async () => ({ success: true })) };
      await call("/v1/lists", {}, { V1_RATE_LIMIT: limiter });
      expect(limiter.limit).not.toHaveBeenCalled();
    });
  });
});
