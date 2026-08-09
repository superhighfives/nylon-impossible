import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, seedTodo, seedUser } from "../helpers";

const USER = "user_test_123";
const AUTH_HEADER = { Authorization: "Bearer test-internal-agent-secret" };

function post(path: string, body: unknown, headers: Record<string, string>) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/internal/agent/* (todo-agent tool routes)", () => {
  beforeEach(async () => {
    await cleanDb();
    await seedUser();
  });

  describe("auth", () => {
    it("rejects a request with no Authorization header", async () => {
      const id = "11111111-1111-1111-1111-111111111111";
      await seedTodo(id, USER);
      const res = await post(
        `/internal/agent/todos/${id}/update`,
        { userId: USER, title: "Hijacked" },
        {},
      );
      expect(res.status).toBe(401);
    });

    it("rejects a request with the wrong secret", async () => {
      const id = "22222222-2222-2222-2222-222222222222";
      await seedTodo(id, USER);
      const res = await post(
        `/internal/agent/todos/${id}/update`,
        { userId: USER, title: "Hijacked" },
        { Authorization: "Bearer not-the-secret" },
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /internal/agent/todos/:id/update", () => {
    it("applies the patch and returns the updated todo", async () => {
      const id = "33333333-3333-3333-3333-333333333333";
      await seedTodo(id, USER, { title: "Original" });

      const res = await post(
        `/internal/agent/todos/${id}/update`,
        { userId: USER, title: "Renamed" },
        AUTH_HEADER,
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ todo: { title: string } }>();
      expect(body.todo.title).toBe("Renamed");
    });

    it("404s for a todo the given userId doesn't own", async () => {
      await seedUser("user_other", "other@example.com");
      const id = "44444444-4444-4444-4444-444444444444";
      await seedTodo(id, "user_other");

      const res = await post(
        `/internal/agent/todos/${id}/update`,
        { userId: USER, title: "Hijacked" },
        AUTH_HEADER,
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /internal/agent/todos/:id/complete", () => {
    it("marks the todo completed", async () => {
      const id = "55555555-5555-5555-5555-555555555555";
      await seedTodo(id, USER, { completed: false });

      const res = await post(
        `/internal/agent/todos/${id}/complete`,
        { userId: USER },
        AUTH_HEADER,
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ todo: { completed: boolean } }>();
      expect(body.todo.completed).toBe(true);
    });
  });

  describe("POST /internal/agent/todos/:id/subtasks", () => {
    it("creates a subtask under the given parent", async () => {
      const parentId = "66666666-6666-6666-6666-666666666666";
      await seedTodo(parentId, USER, { title: "Parent" });

      const res = await post(
        `/internal/agent/todos/${parentId}/subtasks`,
        { userId: USER, title: "New subtask" },
        AUTH_HEADER,
      );

      expect(res.status).toBe(200);
      const body = await res.json<{
        todo: { title: string; parentId: string | null };
      }>();
      expect(body.todo.title).toBe("New subtask");
      expect(body.todo.parentId).toBe(parentId);
    });

    it("400s when the parent doesn't belong to the given userId", async () => {
      await seedUser("user_other", "other@example.com");
      const parentId = "77777777-7777-7777-7777-777777777777";
      await seedTodo(parentId, "user_other", { title: "Not yours" });

      const res = await post(
        `/internal/agent/todos/${parentId}/subtasks`,
        { userId: USER, title: "New subtask" },
        AUTH_HEADER,
      );

      expect(res.status).toBe(400);
    });

    it("400s when the parent is itself a subtask", async () => {
      const grandparent = "88888888-8888-8888-8888-888888888888";
      const parent = "99999999-9999-9999-9999-999999999999";
      await seedTodo(grandparent, USER, { title: "Top level" });
      await seedTodo(parent, USER, {
        title: "Already a subtask",
        parentId: grandparent,
      });

      const res = await post(
        `/internal/agent/todos/${parent}/subtasks`,
        { userId: USER, title: "Sub-subtask" },
        AUTH_HEADER,
      );

      expect(res.status).toBe(400);
    });
  });
});
