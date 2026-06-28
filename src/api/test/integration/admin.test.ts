import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, getDb, users } from "../../src/lib/db";
import { cleanDb, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

function mockAsAdmin(userId = "admin_test_1") {
  mockVerifyToken.mockResolvedValue({
    sub: userId,
    public_metadata: { role: "admin" },
  });
}

function mockAsRegularUser(userId = "user_test_123") {
  mockVerifyToken.mockResolvedValue({ sub: userId });
}

describe("Admin endpoints", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
  });

  describe("authorization", () => {
    it("rejects unauthenticated requests with 401", async () => {
      mockVerifyToken.mockRejectedValue(new Error("No token"));
      const res = await SELF.fetch("http://localhost/admin/users");
      expect(res.status).toBe(401);
    });

    it("rejects non-admin users with 403", async () => {
      mockAsRegularUser();
      await seedUser("user_test_123");
      const res = await SELF.fetch("http://localhost/admin/users", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(403);
      const body = await res.json<{ code: string }>();
      expect(body.code).toBe("forbidden");
    });

    it("allows users with publicMetadata.role === admin", async () => {
      mockAsAdmin();
      await seedUser("admin_test_1", "admin@example.com");
      const res = await SELF.fetch("http://localhost/admin/users", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
    });
  });

  describe("PATCH /admin/users/:id/plan", () => {
    it("flips a user's plan", async () => {
      mockAsAdmin();
      await seedUser("admin_test_1", "admin@example.com");
      await seedUser("target_user", "target@example.com", { plan: "free" });

      const res = await SELF.fetch(
        "http://localhost/admin/users/target_user/plan",
        {
          method: "PATCH",
          headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "pro" }),
        },
      );
      expect(res.status).toBe(200);

      const db = getDb(env.DB);
      const [updated] = await db
        .select({ plan: users.plan })
        .from(users)
        .where(eq(users.id, "target_user"));
      expect(updated?.plan).toBe("pro");
    });

    it("returns 404 for an unknown user", async () => {
      mockAsAdmin();
      await seedUser("admin_test_1", "admin@example.com");
      const res = await SELF.fetch(
        "http://localhost/admin/users/missing/plan",
        {
          method: "PATCH",
          headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "pro" }),
        },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /admin/users cursor handling", () => {
    it("ignores a non-numeric cursor instead of erroring", async () => {
      mockAsAdmin();
      await seedUser("admin_test_1", "admin@example.com");
      const res = await SELF.fetch(
        "http://localhost/admin/users?cursor=not-a-date",
        { headers: AUTH_HEADER },
      );
      expect(res.status).toBe(200);
    });
  });
});
