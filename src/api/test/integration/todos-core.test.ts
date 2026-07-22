import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoMessages, todos } from "../../src/lib/db";
import { listOpenTodos, setTodoCompleted } from "../../src/lib/todos-core";
import { cleanDb, seedMessage, seedTodo, seedUser } from "../helpers";

const USER = "user_test_123";

describe("todos-core (shared by REST + Gmail add-on)", () => {
  beforeEach(async () => {
    await cleanDb();
    await seedUser();
  });

  describe("listOpenTodos", () => {
    it("returns only open top-level todos in position order", async () => {
      await seedTodo("11111111-1111-1111-1111-111111111111", USER, {
        title: "B second",
        position: "a1",
      });
      await seedTodo("22222222-2222-2222-2222-222222222222", USER, {
        title: "A first",
        position: "a0",
      });
      await seedTodo("33333333-3333-3333-3333-333333333333", USER, {
        title: "Completed",
        position: "a2",
        completed: true,
      });
      // A subtask of the first todo — must be excluded (parentId set).
      await seedTodo("44444444-4444-4444-4444-444444444444", USER, {
        title: "Subtask",
        position: "a0",
        parentId: "22222222-2222-2222-2222-222222222222",
      });

      const open = await listOpenTodos(getDb(env.DB), USER);
      expect(open.map((t) => t.title)).toEqual(["A first", "B second"]);
    });
  });

  describe("setTodoCompleted", () => {
    it("returns null for a todo the user doesn't own", async () => {
      await seedUser("user_other", "other@example.com");
      await seedTodo("55555555-5555-5555-5555-555555555555", "user_other");
      const result = await setTodoCompleted(
        getDb(env.DB),
        env,
        USER,
        "55555555-5555-5555-5555-555555555555",
        true,
      );
      expect(result).toBeNull();
    });

    it("rolls a recurring todo's dueDate forward instead of completing it", async () => {
      const id = "66666666-6666-6666-6666-666666666666";
      const due = new Date("2026-07-20T12:00:00.000Z");
      await seedTodo(id, USER, {
        title: "Water plants",
        completed: false,
        dueDate: due,
        recurrence: { frequency: "daily" },
      });

      const updated = await setTodoCompleted(getDb(env.DB), env, USER, id, true);
      expect(updated).not.toBeNull();
      // Recurrence completion doesn't persist as done; it advances the date.
      expect(updated?.completed).toBe(false);
      expect(updated?.completedAt).not.toBeNull();
      expect(updated?.dueDate?.getTime()).toBeGreaterThan(due.getTime());
    });

    it("cascades completion to subtasks and reopens them on uncheck", async () => {
      const parent = "77777777-7777-7777-7777-777777777777";
      const child = "88888888-8888-8888-8888-888888888888";
      await seedTodo(parent, USER, { title: "Parent", completed: false });
      await seedTodo(child, USER, {
        title: "Child",
        completed: false,
        parentId: parent,
      });

      await setTodoCompleted(getDb(env.DB), env, USER, parent, true);
      const db = getDb(env.DB);
      let [childRow] = await db.select().from(todos).where(eq(todos.id, child));
      expect(childRow.completed).toBe(true);

      await setTodoCompleted(db, env, USER, parent, false);
      [childRow] = await db.select().from(todos).where(eq(todos.id, child));
      expect(childRow.completed).toBe(false);
    });

    it("clears needsInput and the awaiting-reply message on completion", async () => {
      const id = "99999999-9999-9999-9999-999999999999";
      await seedTodo(id, USER, {
        title: "Answer the question",
        completed: false,
        needsInput: true,
      });
      const message = await seedMessage(id, {
        role: "assistant",
        awaitingReply: true,
      });

      await setTodoCompleted(getDb(env.DB), env, USER, id, true);

      const db = getDb(env.DB);
      const [todo] = await db.select().from(todos).where(eq(todos.id, id));
      expect(todo.completed).toBe(true);
      expect(todo.needsInput).toBe(false);
      const [reloaded] = await db
        .select()
        .from(todoMessages)
        .where(eq(todoMessages.id, message.id));
      expect(reloaded.awaitingReply).toBe(false);
    });
  });
});
