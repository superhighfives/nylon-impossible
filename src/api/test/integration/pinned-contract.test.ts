import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todos } from "../../src/lib/db";
import { cleanDb, seedTodo, seedUser } from "../helpers";

// Sticky → Pin is mid expand/contract: requests take either spelling (pinned
// wins), responses carry both. The TestFlight build from before the rename
// only speaks `sticky`, so these pin that contract down until it's dropped.

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};
const USER = "user_test_123";

function put(id: string, body: object) {
  return SELF.fetch(`http://localhost/todos/${id}`, {
    method: "PUT",
    headers: AUTH_HEADER,
    body: JSON.stringify(body),
  });
}

function sync(changes: object[]) {
  return SELF.fetch("http://localhost/todos/sync", {
    method: "POST",
    headers: AUTH_HEADER,
    body: JSON.stringify({ changes }),
  });
}

async function storedPinned(id: string) {
  const [row] = await getDb(env.DB)
    .select({ pinned: todos.pinned })
    .from(todos)
    .where(eq(todos.id, id));
  return row?.pinned;
}

describe("pinned/sticky dual contract", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
    await seedUser();
  });

  describe("PUT /todos/:id", () => {
    it("accepts pinned and echoes both keys", async () => {
      const todo = await seedTodo(crypto.randomUUID(), USER);
      const res = await put(todo.id, { pinned: true });
      expect(res.status).toBe(200);
      const body = await res.json<{ pinned: boolean; sticky: boolean }>();
      expect(body.pinned).toBe(true);
      expect(body.sticky).toBe(true);
      expect(await storedPinned(todo.id)).toBe(true);
    });

    it("still accepts the legacy sticky key", async () => {
      const todo = await seedTodo(crypto.randomUUID(), USER);
      const res = await put(todo.id, { sticky: true });
      expect(res.status).toBe(200);
      const body = await res.json<{ pinned: boolean; sticky: boolean }>();
      expect(body).toMatchObject({ pinned: true, sticky: true });
    });

    it("lets pinned win when both are sent", async () => {
      const todo = await seedTodo(crypto.randomUUID(), USER);
      await put(todo.id, { pinned: false, sticky: true });
      expect(await storedPinned(todo.id)).toBe(false);
      await put(todo.id, { pinned: true, sticky: false });
      expect(await storedPinned(todo.id)).toBe(true);
    });
  });

  describe("POST /todos/sync", () => {
    it("creates with legacy sticky and returns both keys", async () => {
      const id = crypto.randomUUID();
      const res = await sync([
        { id, title: "Old build", sticky: true, updatedAt: new Date() },
      ]);
      expect(res.status).toBe(200);
      const body = await res.json<{
        todos: { id: string; pinned: boolean; sticky: boolean }[];
      }>();
      const row = body.todos.find((t) => t.id === id);
      expect(row).toMatchObject({ pinned: true, sticky: true });
    });

    it("updates with pinned, which wins over sticky", async () => {
      const todo = await seedTodo(crypto.randomUUID(), USER);
      const res = await sync([
        {
          id: todo.id,
          pinned: true,
          sticky: false,
          updatedAt: new Date(Date.now() + 1000),
        },
      ]);
      expect(res.status).toBe(200);
      expect(await storedPinned(todo.id)).toBe(true);
    });

    it("keeps the stored value when neither key is sent", async () => {
      const todo = await seedTodo(crypto.randomUUID(), USER);
      await put(todo.id, { pinned: true });
      await sync([
        {
          id: todo.id,
          title: "Renamed",
          updatedAt: new Date(Date.now() + 1000),
        },
      ]);
      expect(await storedPinned(todo.id)).toBe(true);
    });
  });

  it("GET /todos returns both keys", async () => {
    const todo = await seedTodo(crypto.randomUUID(), USER);
    await put(todo.id, { pinned: true });
    const res = await SELF.fetch("http://localhost/todos", {
      headers: AUTH_HEADER,
    });
    const body = await res.json<{ pinned: boolean; sticky: boolean }[]>();
    expect(body[0]).toMatchObject({ pinned: true, sticky: true });
  });

  it("POST /todos/smart returns both keys", async () => {
    const res = await SELF.fetch("http://localhost/todos/smart", {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({ text: "Fresh todo" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      todos: { pinned: boolean; sticky: boolean }[];
    }>();
    expect(body.todos[0]).toMatchObject({ pinned: false, sticky: false });
  });
});
