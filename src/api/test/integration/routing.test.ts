import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanDb,
  getTodayListId,
  seedSystemLists,
  seedTodo,
  seedUser,
} from "../helpers";

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
    it("OPTIONS returns CORS headers for allowed origin", async () => {
      const origin = "https://nylonimpossible.com";
      const res = await SELF.fetch("http://localhost/todos", {
        method: "OPTIONS",
        headers: { Origin: origin },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
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

    it("OPTIONS blocks disallowed origin", async () => {
      const res = await SELF.fetch("http://localhost/todos", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.com" },
      });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("OPTIONS allows localhost origin in dev", async () => {
      const origin = "http://localhost:3000";
      const res = await SELF.fetch("http://localhost/todos", {
        method: "OPTIONS",
        headers: { Origin: origin },
      });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
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

    it("POST /todos/sync without auth returns 401", async () => {
      mockVerifyToken.mockRejectedValue(new Error("No token"));

      const res = await SELF.fetch("http://localhost/todos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: [] }),
      });
      expect(res.status).toBe(401);
    });
  });

  // No app build ever called these, and the web writes through its own
  // server functions; the apps write through /todos/sync. They were removed
  // in #619 and shouldn't come back by accident.
  describe("removed todo write routes", () => {
    const AUTH_JSON = {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    };
    const TODO_ID = "550e8400-e29b-41d4-a716-446655440000";

    beforeEach(async () => {
      await seedUser();
    });

    it("POST /todos returns 404", async () => {
      const res = await SELF.fetch("http://localhost/todos", {
        method: "POST",
        headers: AUTH_JSON,
        body: JSON.stringify({ title: "Test" }),
      });
      expect(res.status).toBe(404);
    });

    it("PUT /todos/:id returns 404", async () => {
      await seedTodo(TODO_ID);
      const res = await SELF.fetch(`http://localhost/todos/${TODO_ID}`, {
        method: "PUT",
        headers: AUTH_JSON,
        body: JSON.stringify({ title: "Renamed" }),
      });
      expect(res.status).toBe(404);
    });

    it("DELETE /todos/:id returns 404", async () => {
      await seedTodo(TODO_ID);
      const res = await SELF.fetch(`http://localhost/todos/${TODO_ID}`, {
        method: "DELETE",
        headers: AUTH_JSON,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("WebSocket auth", () => {
    it("GET /ws without token returns 401", async () => {
      const res = await SELF.fetch("http://localhost/ws", {
        headers: { Upgrade: "websocket" },
      });
      expect(res.status).toBe(401);
    });

    it("GET /ws with invalid token returns 401", async () => {
      mockVerifyToken.mockRejectedValue(new Error("Invalid token"));

      const res = await SELF.fetch("http://localhost/ws?token=bad-token", {
        headers: { Upgrade: "websocket" },
      });
      expect(res.status).toBe(401);
    });

    it("GET /ws without upgrade header returns 400", async () => {
      const res = await SELF.fetch("http://localhost/ws?token=valid-token");
      expect(res.status).toBe(400);
    });
  });

  describe("404 handling", () => {
    it("GET /unknown returns 404", async () => {
      const res = await SELF.fetch("http://localhost/unknown");
      expect(res.status).toBe(404);
    });

    // GET /lists/:id was written for a delete confirmation Settled "Deleting
    // a list" rules out, and no client called it (#617).
    it("GET /lists/:id returns 404 for a real list", async () => {
      await seedUser();
      await seedSystemLists();
      const listId = await getTodayListId();
      const headers = { Authorization: "Bearer test-token" };

      const one = await SELF.fetch(`http://localhost/lists/${listId}`, {
        headers,
      });
      expect(one.status).toBe(404);

      const all = await SELF.fetch("http://localhost/lists", { headers });
      expect(all.status).toBe(200);
      const body = await all.json<{ id: string }[]>();
      expect(body.map((l) => l.id)).toContain(listId.toLowerCase());
    });
  });
});
