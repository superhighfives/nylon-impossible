import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, seedTodoUrl, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

async function createTodoViaAPI(title: string, id?: string) {
  const body: Record<string, string> = { title };
  if (id) body.id = id;

  return SELF.fetch("http://localhost/todos", {
    method: "POST",
    headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Todos CRUD", () => {
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
      await createTodoViaAPI("First todo");
      await createTodoViaAPI("Second todo");

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
      await createTodoViaAPI("No URL todo");

      const res = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(body[0].urls).toEqual([]);
    });

    it("includes urls for each todo ordered by position", async () => {
      const createRes = await createTodoViaAPI("Todo with URLs");
      expect(createRes.status).toBe(201);
      const created = await createRes.json<{ id: string }>();

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

  describe("POST /todos", () => {
    it("creates a todo and returns 201", async () => {
      const res = await createTodoViaAPI("Buy milk");
      expect(res.status).toBe(201);

      const body = await res.json<any>();
      expect(body.title).toBe("Buy milk");
      expect(body.completed).toBe(false);
      expect(body.userId).toBe("user_test_123");
      expect(body.id).toBeTruthy();
    });

    it("uses client-provided UUID", async () => {
      const id = "550e8400-e29b-41d4-a716-446655440000";
      const res = await createTodoViaAPI("Custom ID todo", id);
      expect(res.status).toBe(201);

      const body = await res.json<any>();
      expect(body.id).toBe(id);
    });

    it("rejects empty title", async () => {
      const res = await SELF.fetch("http://localhost/todos", {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects title over 500 characters", async () => {
      const res = await SELF.fetch("http://localhost/todos", {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "a".repeat(501) }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /todos/:id", () => {
    it("updates title", async () => {
      const createRes = await createTodoViaAPI("Original title");
      const created = await createRes.json<any>();

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        method: "PUT",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated title" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.title).toBe("Updated title");
    });

    it("toggles completed", async () => {
      const createRes = await createTodoViaAPI("Toggle me");
      const created = await createRes.json<any>();

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        method: "PUT",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.completed).toBe(true);
    });

    it("updates position", async () => {
      const createRes = await createTodoViaAPI("Move me");
      const created = await createRes.json<any>();

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        method: "PUT",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ position: "b0" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.position).toBe("b0");
    });

    it("returns 404 for non-existent todo", async () => {
      const res = await SELF.fetch(
        "http://localhost/todos/550e8400-e29b-41d4-a716-446655440000",
        {
          method: "PUT",
          headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nope" }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's todo", async () => {
      // Create todo as user_test_123
      const createRes = await createTodoViaAPI("My todo");
      const created = await createRes.json<any>();

      // Switch to different user
      mockVerifyToken.mockResolvedValue({ sub: "user_other" } as any);
      await seedUser("user_other", "other@example.com");

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        method: "PUT",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Stolen!" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /todos/:id", () => {
    it("returns a todo with urls", async () => {
      const createRes = await createTodoViaAPI("My todo");
      expect(createRes.status).toBe(201);
      const created = await createRes.json<any>();

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
      const createRes = await createTodoViaAPI("My todo");
      expect(createRes.status).toBe(201);
      const created = await createRes.json<any>();

      // Switch to different user
      mockVerifyToken.mockResolvedValue({ sub: "user_other" } as any);
      await seedUser("user_other", "other@example.com");

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /todos/:id", () => {
    it("deletes a todo", async () => {
      const createRes = await createTodoViaAPI("Delete me");
      const created = await createRes.json<any>();

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        method: "DELETE",
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.success).toBe(true);

      // Verify it's gone
      const listRes = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      const todos = await listRes.json<any[]>();
      expect(todos).toHaveLength(0);
    });

    it("returns 404 for non-existent todo", async () => {
      const res = await SELF.fetch(
        "http://localhost/todos/550e8400-e29b-41d4-a716-446655440000",
        {
          method: "DELETE",
          headers: AUTH_HEADER,
        },
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's todo", async () => {
      const createRes = await createTodoViaAPI("My todo");
      expect(createRes.status).toBe(201);
      const created = await createRes.json<any>();

      // Switch to different user
      mockVerifyToken.mockResolvedValue({ sub: "user_other" } as any);
      await seedUser("user_other", "other@example.com");

      const res = await SELF.fetch(`http://localhost/todos/${created.id}`, {
        method: "DELETE",
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(404);

      // Verify todo still exists for original user
      mockVerifyToken.mockResolvedValue({ sub: "user_test_123" } as any);
      const listRes = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      const todos = await listRes.json<any[]>();
      expect(todos).toHaveLength(1);
    });
  });

  describe("cross-user isolation", () => {
    it("GET /todos only returns the authenticated user's todos", async () => {
      // Create todo as user_test_123
      const createResA = await createTodoViaAPI("User A todo");
      expect(createResA.status).toBe(201);

      // Switch to user B and create a todo
      mockVerifyToken.mockResolvedValue({ sub: "user_other" } as any);
      await seedUser("user_other", "other@example.com");
      const createResB = await createTodoViaAPI("User B todo");
      expect(createResB.status).toBe(201);

      // User B should only see their own todo
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

  describe("full lifecycle", () => {
    it("create 3, update 1, delete 1, list returns 2", async () => {
      const r1 = await createTodoViaAPI("Todo 1");
      const r2 = await createTodoViaAPI("Todo 2");
      const r3 = await createTodoViaAPI("Todo 3");
      const t1 = await r1.json<any>();
      const t2 = await r2.json<any>();
      const _t3 = await r3.json<any>();

      // Update todo 1
      await SELF.fetch(`http://localhost/todos/${t1.id}`, {
        method: "PUT",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Todo 1" }),
      });

      // Delete todo 2
      await SELF.fetch(`http://localhost/todos/${t2.id}`, {
        method: "DELETE",
        headers: AUTH_HEADER,
      });

      // List should have 2
      const listRes = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      const todos = await listRes.json<any[]>();
      expect(todos).toHaveLength(2);
      expect(todos.map((t: any) => t.title)).toContain("Updated Todo 1");
      expect(todos.map((t: any) => t.title)).toContain("Todo 3");
    });
  });
});
