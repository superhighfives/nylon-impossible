import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const USER = "user_test_123";

async function getMe() {
  const res = await SELF.fetch("http://localhost/users/me", {
    headers: { Authorization: "Bearer test-token" },
  });
  expect(res.status).toBe(200);
  return res.json<{ lastSweep: unknown }>();
}

describe("GET /users/me lastSweep", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
  });

  it("is null until a sweep has moved something", async () => {
    await seedUser(USER);
    expect((await getMe()).lastSweep).toBeNull();
  });

  it("reports when the last sweep moved todos, and how many each way", async () => {
    await seedUser(USER, "test@example.com", {
      lastSweepAt: new Date("2026-06-15T00:15:00Z"),
      lastSweepMovedToThisWeek: 2,
      lastSweepMovedToSomeday: 1,
    });
    expect((await getMe()).lastSweep).toEqual({
      at: "2026-06-15T00:15:00.000Z",
      movedToThisWeek: 2,
      movedToSomeday: 1,
    });
  });

  it("is also returned by PATCH /users/me", async () => {
    await seedUser(USER, "test@example.com", {
      lastSweepAt: new Date("2026-06-15T00:15:00Z"),
      lastSweepMovedToSomeday: 4,
    });
    const res = await SELF.fetch("http://localhost/users/me", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme: "dark" }),
    });
    expect(await res.json()).toMatchObject({
      lastSweep: {
        at: "2026-06-15T00:15:00.000Z",
        movedToThisWeek: 0,
        movedToSomeday: 4,
      },
    });
  });
});
