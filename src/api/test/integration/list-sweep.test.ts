import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, lists, todos } from "../../src/lib/db";
import { runListSweep } from "../../src/lib/list-sweep";
import { cleanDb, seedTodo, seedUser } from "../helpers";

const USER = "user_test_123";

async function getListId(
  userId: string,
  systemKind: "today" | "thisWeek" | "sometime",
) {
  const db = getDb(env.DB);
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.userId, userId), eq(lists.systemKind, systemKind)));
  if (!list) throw new Error(`No ${systemKind} list for ${userId}`);
  return list.id;
}

describe("runListSweep", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it("demotes a non-completed Today todo to This Week at the user's local midnight", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const todayListId = await getListId(USER, "today");
    const todoId = "550e8400-e29b-41d4-a716-446655440001";
    await seedTodo(todoId, USER, { listId: todayListId, completed: false });

    const db = getDb(env.DB);
    // UTC midnight — this user is due for the sweep.
    await runListSweep(db, env, new Date("2026-06-15T00:15:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    const thisWeekListId = await getListId(USER, "thisWeek");
    expect(stored.listId).toBe(thisWeekListId);
  });

  it("does not sweep a user outside their local midnight hour", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const todayListId = await getListId(USER, "today");
    const todoId = "550e8400-e29b-41d4-a716-446655440002";
    await seedTodo(todoId, USER, { listId: todayListId, completed: false });

    const db = getDb(env.DB);
    // 09:00 UTC — nowhere near this UTC user's local midnight.
    await runListSweep(db, env, new Date("2026-06-15T09:00:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    expect(stored.listId).toBe(todayListId);
  });

  it("never touches a completed todo in Today", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const todayListId = await getListId(USER, "today");
    const todoId = "550e8400-e29b-41d4-a716-446655440003";
    await seedTodo(todoId, USER, { listId: todayListId, completed: true });

    const db = getDb(env.DB);
    await runListSweep(db, env, new Date("2026-06-15T00:15:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    expect(stored.listId).toBe(todayListId);
  });

  it("demotes a This Week todo to Sometime once it's sat there 7+ days", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const thisWeekListId = await getListId(USER, "thisWeek");
    const todoId = "550e8400-e29b-41d4-a716-446655440004";
    const eightDaysAgo = new Date("2026-06-07T00:00:00Z");
    await seedTodo(todoId, USER, {
      listId: thisWeekListId,
      completed: false,
      listEnteredAt: eightDaysAgo,
    });

    const db = getDb(env.DB);
    await runListSweep(db, env, new Date("2026-06-15T00:15:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    const sometimeListId = await getListId(USER, "sometime");
    expect(stored.listId).toBe(sometimeListId);
  });

  it("leaves a This Week todo alone if it hasn't been there 7 days yet", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const thisWeekListId = await getListId(USER, "thisWeek");
    const todoId = "550e8400-e29b-41d4-a716-446655440005";
    const twoDaysAgo = new Date("2026-06-13T00:00:00Z");
    await seedTodo(todoId, USER, {
      listId: thisWeekListId,
      completed: false,
      listEnteredAt: twoDaysAgo,
    });

    const db = getDb(env.DB);
    await runListSweep(db, env, new Date("2026-06-15T00:15:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    expect(stored.listId).toBe(thisWeekListId);
  });

  it("is terminal for Sometime — never moves a Sometime todo anywhere", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const sometimeListId = await getListId(USER, "sometime");
    const todoId = "550e8400-e29b-41d4-a716-446655440006";
    const yearAgo = new Date("2025-06-15T00:00:00Z");
    await seedTodo(todoId, USER, {
      listId: sometimeListId,
      completed: false,
      listEnteredAt: yearAgo,
    });

    const db = getDb(env.DB);
    await runListSweep(db, env, new Date("2026-06-15T00:15:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    expect(stored.listId).toBe(sometimeListId);
  });

  it("only sweeps users whose local midnight has arrived, independently", async () => {
    await seedUser("user_utc", "utc@example.com", { timezone: "UTC" });
    await seedUser("user_tokyo", "tokyo@example.com", {
      timezone: "Asia/Tokyo",
    });

    const utcTodayList = await getListId("user_utc", "today");
    const tokyoTodayList = await getListId("user_tokyo", "today");
    const utcTodoId = "550e8400-e29b-41d4-a716-446655440007";
    const tokyoTodoId = "550e8400-e29b-41d4-a716-446655440008";
    await seedTodo(utcTodoId, "user_utc", {
      listId: utcTodayList,
      completed: false,
    });
    await seedTodo(tokyoTodoId, "user_tokyo", {
      listId: tokyoTodayList,
      completed: false,
    });

    const db = getDb(env.DB);
    // 15:15 UTC = 00:15 in Tokyo (UTC+9) — only the Tokyo user is due.
    await runListSweep(db, env, new Date("2026-06-15T15:15:00Z"));

    const [utcStored] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, utcTodoId));
    const [tokyoStored] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, tokyoTodoId));

    expect(utcStored.listId).toBe(utcTodayList);
    expect(tokyoStored.listId).toBe(
      await getListId("user_tokyo", "thisWeek"),
    );
  });
});
