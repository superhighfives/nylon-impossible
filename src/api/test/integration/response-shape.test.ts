import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoUrls } from "../../src/lib/db";
import { cleanDb, seedTodo, seedTodoUrl, seedUser } from "../helpers";

// Every route that returns a todo goes through the one shared serializeTodo,
// and every route that returns a link through serializeUrl. These pin that
// down: each response carries completedAt and showPreview with what's stored,
// and GET /todos and sync answer with the same fields.

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};
const TODO_ID = "550e8400-e29b-41d4-a716-446655440077";
const COMPLETED_AT = "2026-11-01T09:30:00.000Z";
const LINK = "https://example.com/article";

type Url = Record<string, unknown> & { url: string; showPreview: boolean };
type Todo = Record<string, unknown> & {
  id: string;
  completedAt: string | null;
  urls?: Url[];
};

function request(path: string, method = "GET", body?: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method,
    headers: AUTH_HEADER,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(res: Response, status: number): Promise<T> {
  expect(res.status).toBe(status);
  return res.json<T>();
}

function expectSeededTodo(todo: Todo | undefined) {
  expect(todo).toBeDefined();
  expect(todo).toHaveProperty("completedAt", COMPLETED_AT);
  expect(todo?.urls).toHaveLength(1);
  expect(todo?.urls?.[0]).toHaveProperty("showPreview", false);
}

describe("Response shape", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
    // A completed todo with a link set to "Show as URL".
    await seedTodo(TODO_ID, "user_test_123", {
      completed: true,
      completedAt: new Date(COMPLETED_AT),
    });
    const url = await seedTodoUrl(TODO_ID, LINK);
    await getDb(env.DB)
      .update(todoUrls)
      .set({ showPreview: false })
      .where(eq(todoUrls.id, url.id));
  });

  it("GET /todos", async () => {
    const body = await json<Todo[]>(await request("/todos"), 200);
    expectSeededTodo(body.find((t) => t.id === TODO_ID));
  });

  it("GET /todos/:id", async () => {
    expectSeededTodo(await json<Todo>(await request(`/todos/${TODO_ID}`), 200));
  });

  it("POST /todos", async () => {
    const body = await json<Todo>(
      await request("/todos", "POST", { title: "New" }),
      201,
    );
    expect(body).toHaveProperty("completedAt", null);
  });

  it("PUT /todos/:id", async () => {
    const body = await json<Todo>(
      await request(`/todos/${TODO_ID}`, "PUT", { title: "Renamed" }),
      200,
    );
    expect(body).toHaveProperty("completedAt", COMPLETED_AT);
  });

  it("POST /todos/smart", async () => {
    const body = await json<{ todos: Todo[] }>(
      await request("/todos/smart", "POST", { text: "Call the bank" }),
      200,
    );
    expect(body.todos[0]).toHaveProperty("completedAt", null);
  });

  it("POST /todos/sync", async () => {
    const body = await json<{ todos: Todo[] }>(
      await request("/todos/sync", "POST", { changes: [] }),
      200,
    );
    expectSeededTodo(body.todos.find((t) => t.id === TODO_ID));
  });

  it("POST /todos/:id/urls, a new link (201)", async () => {
    const body = await json<Url>(
      await request(`/todos/${TODO_ID}/urls`, "POST", {
        url: "https://example.com/other",
      }),
      201,
    );
    expect(body).toHaveProperty("showPreview", true);
  });

  it("POST /todos/:id/urls, a link the todo already has (200)", async () => {
    const body = await json<Url>(
      await request(`/todos/${TODO_ID}/urls`, "POST", { url: LINK }),
      200,
    );
    expect(body).toHaveProperty("showPreview", false);
  });

  it("GET /todos and POST /todos/sync answer with the same fields", async () => {
    const [listed] = await json<Todo[]>(await request("/todos"), 200);
    const {
      todos: [synced],
    } = await json<{ todos: Todo[] }>(
      await request("/todos/sync", "POST", { changes: [] }),
      200,
    );
    expect(Object.keys(synced).sort()).toEqual(Object.keys(listed).sort());
    expect(Object.keys(synced.urls?.[0] ?? {}).sort()).toEqual(
      Object.keys(listed.urls?.[0] ?? {}).sort(),
    );
    expect(synced).toEqual(listed);
  });
});
