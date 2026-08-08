import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoResearch, todos, todoSuggestions } from "../../src/lib/db";
import { cleanDb, seedSuggestion, seedTodo, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };
const TODO_ID = "11111111-1111-1111-1111-111111111111";

async function accept(
  todoId: string,
  suggestionId: string,
  headers: Record<string, string> = AUTH_HEADER,
) {
  return SELF.fetch(
    `http://localhost/todos/${todoId}/suggestions/${suggestionId}/accept`,
    { method: "POST", headers },
  );
}

async function dismiss(
  todoId: string,
  suggestionId: string,
  headers: Record<string, string> = AUTH_HEADER,
) {
  return SELF.fetch(
    `http://localhost/todos/${todoId}/suggestions/${suggestionId}/dismiss`,
    { method: "POST", headers },
  );
}

describe("POST /todos/:id/suggestions/:sid/accept", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
    await seedTodo(TODO_ID, "user_test_123");
  });

  it("returns 401 when unauthenticated", async () => {
    const suggestion = await seedSuggestion(TODO_ID);
    const res = await accept(TODO_ID, suggestion.id, {});
    expect(res.status).toBe(401);
  });

  it("returns 404 for a nonexistent todo", async () => {
    const res = await accept(
      "22222222-2222-2222-2222-222222222222",
      "some-id",
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's todo", async () => {
    await seedUser("user_other", "other@example.com");
    const otherTodoId = "33333333-3333-3333-3333-333333333333";
    await seedTodo(otherTodoId, "user_other");
    const suggestion = await seedSuggestion(otherTodoId);
    const res = await accept(otherTodoId, suggestion.id);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent suggestion", async () => {
    const res = await accept(TODO_ID, "nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("applies a title suggestion and marks it accepted", async () => {
    const suggestion = await seedSuggestion(TODO_ID, {
      type: "title",
      payload: { title: "Book DMV appointment" },
      label: 'Rename to "Book DMV appointment"',
    });

    const res = await accept(TODO_ID, suggestion.id);
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string }>();
    expect(body.status).toBe("accepted");

    const db = getDb(env.DB);
    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    expect(todo.title).toBe("Book DMV appointment");

    const [reloaded] = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.id, suggestion.id));
    expect(reloaded.status).toBe("accepted");
  });

  it("applies a due_date suggestion", async () => {
    const suggestion = await seedSuggestion(TODO_ID, {
      type: "due_date",
      payload: { dueDate: "2026-07-25" },
      label: "Set due date to Fri 25 Jul",
    });

    const res = await accept(TODO_ID, suggestion.id);
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    expect(todo.dueDate?.toISOString().slice(0, 10)).toBe("2026-07-25");
  });

  it("refuses a recurrence suggestion when the todo has no due date", async () => {
    const suggestion = await seedSuggestion(TODO_ID, {
      type: "recurrence",
      payload: { recurrence: { frequency: "weekly" } },
      label: "Repeat weekly",
    });

    const res = await accept(TODO_ID, suggestion.id);
    expect(res.status).toBe(409);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe("suggestion_conflict");

    const db = getDb(env.DB);
    const [reloaded] = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.id, suggestion.id));
    expect(reloaded.status).toBe("pending");
  });

  it("applies a recurrence suggestion when the todo has a due date", async () => {
    await getDb(env.DB)
      .update(todos)
      .set({ dueDate: new Date("2026-07-25") })
      .where(eq(todos.id, TODO_ID));
    const suggestion = await seedSuggestion(TODO_ID, {
      type: "recurrence",
      payload: { recurrence: { frequency: "weekly" } },
      label: "Repeat weekly",
    });

    const res = await accept(TODO_ID, suggestion.id);
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    expect(todo.recurrence).toEqual({ frequency: "weekly" });
  });

  it("applies a subtasks suggestion by creating child todos", async () => {
    const suggestion = await seedSuggestion(TODO_ID, {
      type: "subtasks",
      payload: { titles: ["Book venue", "Send invites"] },
      label: "Add 2 subtasks: Book venue, Send invites",
    });

    const res = await accept(TODO_ID, suggestion.id);
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const children = await db
      .select()
      .from(todos)
      .where(eq(todos.parentId, TODO_ID));
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.title).sort()).toEqual(
      ["Book venue", "Send invites"].sort(),
    );
  });

  it("applies a research suggestion by creating a pending research row", async () => {
    const suggestion = await seedSuggestion(TODO_ID, {
      type: "research",
      payload: { searchQuery: "best pizza NYC", researchType: "general" },
      label: "Research this",
    });

    const res = await accept(TODO_ID, suggestion.id);
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const [research] = await db
      .select()
      .from(todoResearch)
      .where(eq(todoResearch.todoId, TODO_ID));
    expect(research.status).toBe("pending");
    expect(research.searchQuery).toBe("best pizza NYC");
  });

  it("returns 409 when accepting an already-accepted suggestion", async () => {
    const suggestion = await seedSuggestion(TODO_ID, { status: "accepted" });
    const res = await accept(TODO_ID, suggestion.id);
    expect(res.status).toBe(409);
  });
});

describe("POST /todos/:id/suggestions/:sid/dismiss", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
    await seedTodo(TODO_ID, "user_test_123");
  });

  it("returns 401 when unauthenticated", async () => {
    const suggestion = await seedSuggestion(TODO_ID);
    const res = await dismiss(TODO_ID, suggestion.id, {});
    expect(res.status).toBe(401);
  });

  it("marks a pending suggestion dismissed without applying it", async () => {
    const suggestion = await seedSuggestion(TODO_ID, {
      type: "title",
      payload: { title: "Should not apply" },
    });

    const res = await dismiss(TODO_ID, suggestion.id);
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    expect(todo.title).toBe("Test todo");

    const [reloaded] = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.id, suggestion.id));
    expect(reloaded.status).toBe("dismissed");
  });

  it("returns 409 when dismissing an already-dismissed suggestion", async () => {
    const suggestion = await seedSuggestion(TODO_ID, { status: "dismissed" });
    const res = await dismiss(TODO_ID, suggestion.id);
    expect(res.status).toBe(409);
  });
});
