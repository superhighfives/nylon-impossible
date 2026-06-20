import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoMessages, todos } from "../../src/lib/db";
import { cleanDb, seedMessage, seedTodo, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };
const TODO_ID = "22222222-2222-2222-2222-222222222222";

async function dismiss(
  todoId: string,
  headers: Record<string, string> = AUTH_HEADER,
) {
  return SELF.fetch(`http://localhost/todos/${todoId}/question`, {
    method: "DELETE",
    headers,
  });
}

describe("DELETE /todos/:id/question", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await dismiss(TODO_ID, {});
    expect(res.status).toBe(401);
  });

  it("returns 404 for a nonexistent todo", async () => {
    const res = await dismiss(TODO_ID);
    expect(res.status).toBe(404);
  });

  it("clears needs_input and awaitingReply, bumps updatedAt, adds no message", async () => {
    const oldUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    await seedTodo(TODO_ID, "user_test_123", {
      needsInput: true,
      updatedAt: oldUpdatedAt,
    });
    const assistant = await seedMessage(TODO_ID, {
      role: "assistant",
      awaitingReply: true,
    });

    const res = await dismiss(TODO_ID);
    expect(res.status).toBe(200);

    const db = getDb(env.DB);

    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    expect(todo.needsInput).toBe(false);
    expect(todo.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());

    // Question message stays in history but no longer awaiting; no new message.
    const messages = await db
      .select()
      .from(todoMessages)
      .where(eq(todoMessages.todoId, TODO_ID));
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(assistant.id);
    expect(messages[0].awaitingReply).toBe(false);
  });
});
