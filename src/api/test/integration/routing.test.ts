import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

describe("API routing", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
  });

  describe("CORS", () => {
    it("OPTIONS returns CORS headers", async () => {
      const res = await SELF.fetch("http://localhost/todos", {
        method: "OPTIONS",
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain(
        "DELETE",
      );
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        "Authorization",
      );
    });
  });

  describe("health check", () => {
    it("GET / returns 200 OK", async () => {
      const res = await SELF.fetch("http://localhost/");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    });

    it("GET /health returns 200 OK", async () => {
      const res = await SELF.fetch("http://localhost/health");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    });
  });

  describe("authentication", () => {
    it("GET /todos without auth returns 401", async () => {
      mockVerifyToken.mockRejectedValue(new Error("No token"));

      const res = await SELF.fetch("http://localhost/todos");
      expect(res.status).toBe(401);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("Unauthorized");
    });

    it("POST /todos without auth returns 401", async () => {
      mockVerifyToken.mockRejectedValue(new Error("No token"));

      const res = await SELF.fetch("http://localhost/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("404 handling", () => {
    it("GET /unknown returns 404", async () => {
      const res = await SELF.fetch("http://localhost/unknown");
      expect(res.status).toBe(404);
    });
  });
});
