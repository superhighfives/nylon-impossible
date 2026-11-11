import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, seedTodo, seedTodoUrl, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

// GET /todos orders by createdAt, so each seeded todo is a second later than
// the one before.
let seeded = 0;
async function createTodo(title: string, userId = "user_test_123") {
  seeded += 1;
  return seedTodo(crypto.randomUUID(), userId, {
    title,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seeded)),
  });
}

describe("Todos read", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  describe("GET /todos", () => {
    it("returns empty array for new user", async () => {
      const res = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(body).toEqual([]);
    });

    it("returns created todos", async () => {
      await createTodo("First todo");
      await createTodo("Second todo");

      const res = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(body).toHaveLength(2);
      expect(body[0].title).toBe("First todo");
      expect(body[1].title).toBe("Second todo");
    });

    it("includes empty urls array for todos with no urls", async () => {
      await createTodo("No URL todo");

      const res = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(body[0].urls).toEqual([]);
    });

    it("includes urls for each todo ordered by position", async () => {
      const created = await createTodo("Todo with URLs");

      await seedTodoUrl(created.id, "https://example.com/b", "b0");
      await seedTodoUrl(created.id, "https://example.com/a", "a0");

      const res = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(body[0].urls).toHaveLength(2);
      expect(body[0].urls[0].url).toBe("https://example.com/a");
      expect(body[0].urls[1].url).toBe("https://example.com/b");
    });
  });

  describe("GET /todos/:id", () => {
    it("returns a todo with urls", async () => {
      const created = await createTodo("My todo");

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.title).toBe("My todo");
      expect(body.urls).toEqual([]);
    });

    it("returns 404 for non-existent todo", async () => {
      const res = await SELF.fetch(
        "http://localhost/todos/550e8400-e29b-41d4-a716-446655440000",
        { headers: AUTH_HEADER },
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's todo", async () => {
      const created = await createTodo("My todo");

      // Switch to different user
      mockVerifyToken.mockResolvedValue({ sub: "user_other" } as any);
      await seedUser("user_other", "other@example.com");

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("cross-user isolation", () => {
    it("GET /todos only returns the authenticated user's todos", async () => {
      await createTodo("User A todo");
      await seedUser("user_other", "other@example.com");
      await createTodo("User B todo", "user_other");

      // User B should only see their own todo
      mockVerifyToken.mockResolvedValue({ sub: "user_other" } as any);
      const resB = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      const todosB = await resB.json<any[]>();
      expect(todosB).toHaveLength(1);
      expect(todosB[0].title).toBe("User B todo");

      // Switch back to user A
      mockVerifyToken.mockResolvedValue({ sub: "user_test_123" } as any);
      const resA = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      const todosA = await resA.json<any[]>();
      expect(todosA).toHaveLength(1);
      expect(todosA[0].title).toBe("User A todo");
    });
  });

  // iOS sends `uuidString`, which is uppercase. Rows are stored lowercase,
  // and every route lowercases the ID in its path before looking it up.
  describe("uppercase todo IDs", () => {
    const LOWER = "550e8400-e29b-41d4-a716-4466554400aa";
    const UPPER = LOWER.toUpperCase();

    it("GET /todos/:id finds the todo by its uppercase id", async () => {
      await seedTodo(LOWER);
      const res = await SELF.fetch(`http://localhost/todos/${UPPER}`, {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      expect((await res.json<{ id: string }>()).id).toBe(LOWER);
    });

    it("finds a lowercase id too", async () => {
      await seedTodo(LOWER);
      const res = await SELF.fetch(`http://localhost/todos/${LOWER}`, {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
    });
  });
});
