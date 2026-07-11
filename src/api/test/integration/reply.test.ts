import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoMessages, todos } from "../../src/lib/db";
import { cleanDb, seedMessage, seedTodo, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };
const TODO_ID = "11111111-1111-1111-1111-111111111111";

async function reply(
  todoId: string,
  body: unknown,
  headers: Record<string, string> = AUTH_HEADER,
) {
  return SELF.fetch(`http://localhost/todos/${todoId}/reply`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /todos/:id/reply", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await reply(TODO_ID, { content: "Lisbon" }, {});
    expect(res.status).toBe(401);
  });

  it("returns 404 for a nonexistent todo", async () => {
    const res = await reply(TODO_ID, { content: "Lisbon" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's todo", async () => {
    await seedUser("user_other", "other@example.com");
    await seedTodo(TODO_ID, "user_other", { needsInput: true });
    const res = await reply(TODO_ID, { content: "Lisbon" });
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty content", async () => {
    await seedTodo(TODO_ID, "user_test_123", { needsInput: true });
    const res = await reply(TODO_ID, { content: "" });
    expect(res.status).toBe(400);
  });

  it("returns 403 pro_required for a free-plan user", async () => {
    mockVerifyToken.mockResolvedValue({ sub: "user_free" });
    await seedUser("user_free", "free@example.com", { plan: "free" });
    await seedTodo(TODO_ID, "user_free", { needsInput: true });
    const res = await reply(TODO_ID, { content: "Lisbon" });
    expect(res.status).toBe(403);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe("pro_required");

    // The reply must not have been persisted.
    const db = getDb(env.DB);
    const messages = await db
      .select()
      .from(todoMessages)
      .where(eq(todoMessages.todoId, TODO_ID));
    expect(messages).toHaveLength(0);
  });

  it("inserts a user message, clears flags, and bumps updatedAt", async () => {
    const oldUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    await seedTodo(TODO_ID, "user_test_123", {
      needsInput: true,
      updatedAt: oldUpdatedAt,
    });
    const assistant = await seedMessage(TODO_ID, {
      role: "assistant",
      awaitingReply: true,
    });

    const res = await reply(TODO_ID, { content: "Lisbon next Friday" });
    expect(res.status).toBe(201);

    const db = getDb(env.DB);

    // User message inserted
    const userMessages = await db
      .select()
      .from(todoMessages)
      .where(
        and(eq(todoMessages.todoId, TODO_ID), eq(todoMessages.role, "user")),
      );
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("Lisbon next Friday");
    expect(userMessages[0].awaitingReply).toBe(false);

    // Previous assistant message no longer awaiting
    const [reloadedAssistant] = await db
      .select()
      .from(todoMessages)
      .where(eq(todoMessages.id, assistant.id));
    expect(reloadedAssistant.awaitingReply).toBe(false);

    // Todo flags cleared and updatedAt bumped
    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    expect(todo.needsInput).toBe(false);
    expect(todo.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
  });
});
