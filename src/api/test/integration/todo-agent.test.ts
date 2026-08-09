import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, seedTodo, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const USER = "user_test_123";
const AUTH_HEADER = { Authorization: "Bearer test-token" };

describe("/todos/:id/agent/* (chat proxy + confirm-delete)", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
    await seedUser();
  });

  describe("POST /todos/:id/agent/message", () => {
    it("rejects an unauthenticated request", async () => {
      const id = "11111111-1111-1111-1111-111111111111";
      await seedTodo(id, USER);

      const res = await SELF.fetch(
        `http://localhost/todos/${id}/agent/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hi" }),
        },
      );

      expect(res.status).toBe(401);
    });

    it("404s for a todo the caller doesn't own", async () => {
      await seedUser("user_other", "other@example.com");
      const id = "22222222-2222-2222-2222-222222222222";
      await seedTodo(id, "user_other");

      const res = await SELF.fetch(
        `http://localhost/todos/${id}/agent/message`,
        {
          method: "POST",
          headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hi" }),
        },
      );

      expect(res.status).toBe(404);
    });

    it("400s an empty message before reaching the agent", async () => {
      const id = "33333333-3333-3333-3333-333333333333";
      await seedTodo(id, USER);

      const res = await SELF.fetch(
        `http://localhost/todos/${id}/agent/message`,
        {
          method: "POST",
          headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
          body: JSON.stringify({ message: "" }),
        },
      );

      expect(res.status).toBe(400);
    });
  });

  describe("GET /todos/:id/agent/messages", () => {
    it("404s for a todo the caller doesn't own", async () => {
      await seedUser("user_other", "other@example.com");
      const id = "44444444-4444-4444-4444-444444444444";
      await seedTodo(id, "user_other");

      const res = await SELF.fetch(
        `http://localhost/todos/${id}/agent/messages`,
        { headers: AUTH_HEADER },
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /todos/:id/agent/confirm-delete", () => {
    it("deletes the todo, same as DELETE /todos/:id", async () => {
      const id = "55555555-5555-5555-5555-555555555555";
      await seedTodo(id, USER);

      const res = await SELF.fetch(
        `http://localhost/todos/${id}/agent/confirm-delete`,
        { method: "POST", headers: AUTH_HEADER },
      );
      expect(res.status).toBe(200);

      const getRes = await SELF.fetch(`http://localhost/todos/${id}`, {
        headers: AUTH_HEADER,
      });
      expect(getRes.status).toBe(404);
    });

    it("404s for a todo the caller doesn't own", async () => {
      await seedUser("user_other", "other@example.com");
      const id = "66666666-6666-6666-6666-666666666666";
      await seedTodo(id, "user_other");

      const res = await SELF.fetch(
        `http://localhost/todos/${id}/agent/confirm-delete`,
        { method: "POST", headers: AUTH_HEADER },
      );

      expect(res.status).toBe(404);
    });
  });
});
