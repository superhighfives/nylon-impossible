import { verifyToken } from "@clerk/backend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import wranglerConfig from "../../wrangler.jsonc?raw";
import { callWorker as call, cleanDb, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

// USER_RATE_LIMIT's blocks in wrangler.jsonc: production, then previews.
const configured = [
  ...wranglerConfig.matchAll(
    /"name": "USER_RATE_LIMIT",\s*"namespace_id": "(\d+)",\s*"simple": \{ "limit": (\d+), "period": (\d+) \}/g,
  ),
].map(([, namespace, limit, period]) => ({
  namespace,
  limit: Number(limit),
  period: Number(period),
}));
const LIMIT = configured[0]?.limit ?? 0;

/**
 * Stands in for the Workers binding, counting per key against the limit
 * wrangler.jsonc sets. The real one counts per Cloudflare location in fixed
 * windows, which a test can't line up with.
 */
function countingLimiter() {
  const counts = new Map<string, number>();
  return {
    limit: vi.fn(async ({ key }: { key: string }) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= LIMIT };
    }),
  };
}

const USER_A = "user_rate_a";
const USER_B = "user_rate_b";

function request(
  path: "/users/me" | "/todos/sync",
  token: string,
  limiter: ReturnType<typeof countingLimiter>,
) {
  const init =
    path === "/todos/sync"
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: [] }),
        }
      : {};
  return call(path, { ...init, token }, { USER_RATE_LIMIT: limiter });
}

describe("USER_RATE_LIMIT", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockImplementation(async (token: string) => ({
      sub: token === "session-b" ? USER_B : USER_A,
    }));
    await seedUser(USER_A, "a@example.com");
    await seedUser(USER_B, "b@example.com");
  });

  afterEach(() => {
    // Back to the mock's default user for the files that run after this one.
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
  });

  it("is 300 requests a minute, separate from /v1's, in production and previews", () => {
    expect(configured).toEqual([
      { namespace: "1002", limit: 300, period: 60 },
      { namespace: "1002", limit: 300, period: 60 },
    ]);
  });

  for (const path of ["/users/me", "/todos/sync"] as const) {
    it(`answers a user's 301st request to ${path} with 429 rate_limited, and not their 300th`, async () => {
      const limiter = countingLimiter();
      for (let i = 0; i < LIMIT; i++) {
        const res = await request(path, "session-a", limiter);
        expect(res.status).toBe(200);
      }

      const res = await request(path, "session-a", limiter);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
      expect(await res.json()).toEqual({
        error: "Too many requests. Try again in a minute.",
        code: "rate_limited",
      });
      // Keyed on the Clerk user id.
      expect(limiter.limit).toHaveBeenLastCalledWith({ key: USER_A });

      // Another user's requests in the same minute still go through.
      const other = await request(path, "session-b", limiter);
      expect(other.status).toBe(200);
    }, 120_000);
  }

  it("isn't counted for a request whose token doesn't verify", async () => {
    mockVerifyToken.mockRejectedValue(new Error("invalid"));
    const limiter = countingLimiter();
    const res = await request("/users/me", "session-a", limiter);
    expect(res.status).toBe(401);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("isn't used by /v1, which keeps its per-token limit", async () => {
    const limiter = countingLimiter();
    await call(
      "/v1/lists",
      { token: `nyl_${"A".repeat(43)}` },
      { USER_RATE_LIMIT: limiter },
    );
    expect(limiter.limit).not.toHaveBeenCalled();
  });
});
