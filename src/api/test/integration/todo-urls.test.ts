import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoUrls } from "../../src/lib/db";
import { cleanDb, seedTodo, seedTodoUrl, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };
const TODO_ID = "550e8400-e29b-41d4-a716-446655440001";

function addUrl(todoId: string, body: unknown) {
  return SELF.fetch(`http://localhost/todos/${todoId}/urls`, {
    method: "POST",
    headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchUrl(todoId: string, urlId: string, body: unknown) {
  return SELF.fetch(`http://localhost/todos/${todoId}/urls/${urlId}`, {
    method: "PATCH",
    headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteUrl(todoId: string, urlId: string) {
  return SELF.fetch(`http://localhost/todos/${todoId}/urls/${urlId}`, {
    method: "DELETE",
    headers: AUTH_HEADER,
  });
}

async function storedUrl(id: string) {
  const db = getDb(env.DB);
  const [row] = await db.select().from(todoUrls).where(eq(todoUrls.id, id));
  return row;
}

describe("Todo links", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  it("adds a link after the todo's others, pending its title", async () => {
    await seedTodo(TODO_ID);
    const first = await seedTodoUrl(TODO_ID, "https://example.com", "a5");

    const res = await addUrl(TODO_ID, { url: "  visitlisboa.com/en  " });
    expect(res.status).toBe(201);
    const body = await res.json<{
      id: string;
      todoId: string;
      url: string;
      fetchStatus: string;
      position: string;
    }>();
    expect(body).toMatchObject({
      todoId: TODO_ID,
      url: "https://visitlisboa.com/en",
      fetchStatus: "pending",
    });
    expect(body.position > first.position).toBe(true);
    expect((await storedUrl(body.id))?.url).toBe("https://visitlisboa.com/en");
  });

  it("returns a link the todo already has instead of adding it again", async () => {
    await seedTodo(TODO_ID);
    const first = await addUrl(TODO_ID, { url: "example.com" });
    expect(first.status).toBe(201);
    const { id } = await first.json<{ id: string }>();

    const again = await addUrl(TODO_ID, { url: "https://example.com/" });
    expect(again.status).toBe(200);
    expect((await again.json<{ id: string }>()).id).toBe(id);

    const db = getDb(env.DB);
    const rows = await db
      .select()
      .from(todoUrls)
      .where(eq(todoUrls.todoId, TODO_ID));
    expect(rows).toHaveLength(1);
  });

  it.each([
    "hello",
    "not a link",
    "javascript:alert(1)",
    "ftp://example.com",
    "",
  ])("rejects %j as not a link", async (url) => {
    await seedTodo(TODO_ID);
    const res = await addUrl(TODO_ID, { url });
    expect(res.status).toBe(400);
    expect((await res.json<{ code: string }>()).code).toBe("invalid_url");
  });

  it("rejects a body without a url", async () => {
    await seedTodo(TODO_ID);
    expect((await addUrl(TODO_ID, { link: "example.com" })).status).toBe(400);
  });

  it("404s when adding to another user's todo", async () => {
    await seedTodo(TODO_ID);
    mockVerifyToken.mockResolvedValue({ sub: "user_other" });
    await seedUser("user_other", "other@example.com");
    const res = await addUrl(TODO_ID, { url: "example.com" });
    expect(res.status).toBe(404);
    expect((await res.json<{ code: string }>()).code).toBe("todo_not_found");
  });

  it("shows a link as its bare URL, and back", async () => {
    await seedTodo(TODO_ID);
    const url = await seedTodoUrl(TODO_ID, "https://example.com");

    const res = await patchUrl(TODO_ID, url.id, { showPreview: false });
    expect(res.status).toBe(200);
    expect((await storedUrl(url.id))?.showPreview).toBe(false);

    await patchUrl(TODO_ID, url.id, { showPreview: true });
    expect((await storedUrl(url.id))?.showPreview).toBe(true);
  });

  it("rejects a body without showPreview", async () => {
    await seedTodo(TODO_ID);
    const url = await seedTodoUrl(TODO_ID, "https://example.com");
    const res = await patchUrl(TODO_ID, url.id, { showPreview: "no" });
    expect(res.status).toBe(400);
  });

  it("removes a link", async () => {
    await seedTodo(TODO_ID);
    const url = await seedTodoUrl(TODO_ID, "https://example.com");

    const res = await deleteUrl(TODO_ID, url.id);
    expect(res.status).toBe(200);
    expect(await storedUrl(url.id)).toBeUndefined();
  });

  it("404s for a link on another todo", async () => {
    await seedTodo(TODO_ID);
    const otherTodo = "550e8400-e29b-41d4-a716-446655440002";
    await seedTodo(otherTodo);
    const url = await seedTodoUrl(otherTodo, "https://example.com");

    const res = await deleteUrl(TODO_ID, url.id);
    expect(res.status).toBe(404);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe("link_not_found");
    expect(await storedUrl(url.id)).toBeDefined();
  });

  it("404s for another user's link", async () => {
    await seedTodo(TODO_ID);
    const url = await seedTodoUrl(TODO_ID, "https://example.com");

    mockVerifyToken.mockResolvedValue({ sub: "user_other" });
    await seedUser("user_other", "other@example.com");

    expect(
      (await patchUrl(TODO_ID, url.id, { showPreview: false })).status,
    ).toBe(404);
    expect((await deleteUrl(TODO_ID, url.id)).status).toBe(404);
    expect((await storedUrl(url.id))?.showPreview).toBe(true);
  });
});
