import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import type { V1List, V1TodosResponse } from "@nylon-impossible/shared/api-v1";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, getDb, lists, todos } from "../../src/lib/db";
import {
  callWorker,
  cleanDb,
  createApiToken,
  seedTodo,
  seedUser,
} from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const HEADERS = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};
const USER = "user_test_123";
const OTHER = "user_other_456";

const LIST = "aaaaaaaa-0000-4000-8000-000000000705";
const UPPER = LIST.toUpperCase();

function send(method: string, path: string, body?: object) {
  return SELF.fetch(`http://localhost${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function seedList(id: string, userId = USER) {
  await getDb(env.DB)
    .insert(lists)
    .values({ id, userId, name: "Records", kind: "custom", position: "b0" });
}

async function storedListIds() {
  const { results } = await env.DB.prepare(
    "SELECT `id` FROM `lists` WHERE `kind` = 'custom'",
  ).all<{ id: string }>();
  return results.map((r) => r.id);
}

async function storedTodoListId(todoId: string) {
  const [row] = await getDb(env.DB)
    .select({ listId: todos.listId })
    .from(todos)
    .where(eq(todos.id, todoId));
  return row?.listId;
}

// List ids are stored and looked up lowercase, whatever case a client sends
// them in, as #615 did for todo ids (#705).
describe("list ids in any case", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
    await seedUser(USER);
  });

  describe("POST /lists", () => {
    it("stores an uppercase id lowercased, and returns the row's id", async () => {
      const res = await send("POST", "/lists", { id: UPPER, name: "Records" });
      expect(res.status).toBe(201);
      expect((await res.json<{ id: string }>()).id).toBe(LIST);
      expect(await storedListIds()).toEqual([LIST]);
    });

    it("returns the caller's own list with 200 for an id it already has, in any case", async () => {
      await seedList(LIST);
      for (const id of [LIST, UPPER]) {
        const res = await send("POST", "/lists", { id, name: "Again" });
        expect(res.status).toBe(200);
        expect(await res.json<{ id: string; name: string }>()).toMatchObject({
          id: LIST,
          name: "Records",
        });
      }
      expect(await storedListIds()).toEqual([LIST]);
    });

    it("returns 409 list_id_taken for another user's list id", async () => {
      await seedUser(OTHER, "other@example.com");
      await seedList(LIST, OTHER);
      const res = await send("POST", "/lists", { id: UPPER, name: "Mine" });
      expect(res.status).toBe(409);
      expect((await res.json<{ code: string }>()).code).toBe("list_id_taken");
    });
  });

  describe("/lists/:id", () => {
    it("PATCH and DELETE find a list by its uppercased id", async () => {
      const created = await send("POST", "/lists", { id: LIST, name: "Case" });
      expect(created.status).toBe(201);

      const patched = await send("PATCH", `/lists/${UPPER}`, {
        name: "Renamed",
      });
      expect(patched.status).toBe(200);
      expect(await patched.json<{ id: string; name: string }>()).toMatchObject({
        id: LIST,
        name: "Renamed",
      });

      const deleted = await send("DELETE", `/lists/${UPPER}`);
      expect(deleted.status).toBe(200);
      expect(await storedListIds()).toEqual([]);
    });
  });

  describe("list ids handed in", () => {
    beforeEach(async () => {
      await seedList(LIST);
    });

    it("/todos/sync creates a todo in a list sent in uppercase", async () => {
      const id = "550e8400-e29b-41d4-a716-446655440705";
      const res = await send("POST", "/todos/sync", {
        changes: [
          {
            id,
            title: "Find the B-side",
            listId: UPPER,
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      expect(res.status).toBe(200);
      expect(await storedTodoListId(id)).toBe(LIST);
    });

    it("/todos/sync moves a todo to a list sent in uppercase", async () => {
      const id = "550e8400-e29b-41d4-a716-446655440706";
      await seedTodo(id, USER, { title: "Find the B-side" });
      const res = await send("POST", "/todos/sync", {
        changes: [
          { id, listId: UPPER, updatedAt: new Date(Date.now() + 1000) },
        ],
      });
      expect(res.status).toBe(200);
      expect(await storedTodoListId(id)).toBe(LIST);
    });

    it("/todos/smart creates a todo in a list sent in uppercase", async () => {
      const res = await send("POST", "/todos/smart", {
        text: "Find the B-side",
        listId: UPPER,
      });
      expect(res.status).toBe(200);
      const body = await res.json<{ todos: { id: string }[] }>();
      expect(await storedTodoListId(body.todos[0].id)).toBe(LIST);
    });

    describe("/v1", () => {
      let token: string;

      beforeEach(async () => {
        ({ token } = await createApiToken());
        await seedTodo("todo-705", USER, {
          title: "Find the B-side",
          listId: LIST,
        });
      });

      it("GET /v1/lists/:id finds a list by its uppercased id", async () => {
        const res = await callWorker(`/v1/lists/${UPPER}`, { token });
        expect(res.status).toBe(200);
        expect((await res.json<V1List>()).id).toBe(LIST);
      });

      it("GET /v1/lists/:id/todos finds a list by its uppercased id", async () => {
        const res = await callWorker(`/v1/lists/${UPPER}/todos`, { token });
        expect(res.status).toBe(200);
        const body = await res.json<V1TodosResponse>();
        expect(body.data.map((t) => t.id)).toEqual(["todo-705"]);
      });
    });
  });
});
