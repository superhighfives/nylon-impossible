import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, lists, todos, users } from "../../src/lib/db";
import { runListSweep } from "../../src/lib/list-sweep";
import { cleanDb, seedTodo, seedUser } from "../helpers";

const USER = "user_test_123";

async function getListId(
  userId: string,
  systemKind: "today" | "thisWeek" | "someday",
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

  it("demotes a non-completed Today todo to This week at the user's local midnight", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const todayListId = await getListId(USER, "today");
    const todoId = "550e8400-e29b-41d4-a716-446655440001";
    await seedTodo(todoId, USER, {
      listId: todayListId,
      completed: false,
      listEnteredAt: new Date("2026-06-13T12:00:00Z"),
    });

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

  it("keeps a Today todo through the next full day before demoting it", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const todayListId = await getListId(USER, "today");
    const thisWeekListId = await getListId(USER, "thisWeek");
    const db = getDb(env.DB);

    // Added 4am Tuesday, 8pm Tuesday, and 00:01 Tuesday (2026-06-16).
    const cases = [
      ["550e8400-e29b-41d4-a716-446655440009", "2026-06-16T04:00:00Z"],
      ["550e8400-e29b-41d4-a716-44665544000a", "2026-06-16T20:00:00Z"],
      ["550e8400-e29b-41d4-a716-44665544000b", "2026-06-16T00:01:00Z"],
    ] as const;
    for (const [id, enteredAt] of cases) {
      await seedTodo(id, USER, {
        listId: todayListId,
        completed: false,
        listEnteredAt: new Date(enteredAt),
      });
    }

    const listOf = async (id: string) =>
      (await db.select().from(todos).where(eq(todos.id, id)))[0].listId;

    // Midnight starting Wednesday: none has had 24 hours yet.
    await runListSweep(db, env, new Date("2026-06-17T00:05:00Z"));
    for (const [id] of cases) expect(await listOf(id)).toBe(todayListId);

    // Midnight starting Thursday: all three move.
    await runListSweep(db, env, new Date("2026-06-18T00:05:00Z"));
    for (const [id] of cases) expect(await listOf(id)).toBe(thisWeekListId);
  });

  it("measures the 24 hours from midnight, not from when the sweep runs", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const todayListId = await getListId(USER, "today");
    const todoId = "550e8400-e29b-41d4-a716-44665544000c";
    // Added just after the previous midnight's sweep.
    await seedTodo(todoId, USER, {
      listId: todayListId,
      completed: false,
      listEnteredAt: new Date("2026-06-14T00:00:30Z"),
    });

    const db = getDb(env.DB);
    // A late-firing run (or a retry) is still more than 24h after it was
    // added, but the midnight it's sweeping for isn't.
    await runListSweep(db, env, new Date("2026-06-15T00:45:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    expect(stored.listId).toBe(todayListId);
  });

  it("demotes a This week todo to Someday once it's sat there 7+ days", async () => {
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
    const somedayListId = await getListId(USER, "someday");
    expect(stored.listId).toBe(somedayListId);
  });

  it("leaves a This week todo alone if it hasn't been there 7 days yet", async () => {
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

  it("is terminal for Someday — never moves a Someday todo anywhere", async () => {
    await seedUser(USER, "test@example.com", { timezone: "UTC" });
    const somedayListId = await getListId(USER, "someday");
    const todoId = "550e8400-e29b-41d4-a716-446655440006";
    const yearAgo = new Date("2025-06-15T00:00:00Z");
    await seedTodo(todoId, USER, {
      listId: somedayListId,
      completed: false,
      listEnteredAt: yearAgo,
    });

    const db = getDb(env.DB);
    await runListSweep(db, env, new Date("2026-06-15T00:15:00Z"));

    const [stored] = await db.select().from(todos).where(eq(todos.id, todoId));
    expect(stored.listId).toBe(somedayListId);
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
      listEnteredAt: new Date("2026-06-13T12:00:00Z"),
    });
    await seedTodo(tokyoTodoId, "user_tokyo", {
      listId: tokyoTodayList,
      completed: false,
      listEnteredAt: new Date("2026-06-13T12:00:00Z"),
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
    expect(tokyoStored.listId).toBe(await getListId("user_tokyo", "thisWeek"));
  });

  describe("overnight record", () => {
    const sweptAt = new Date("2026-06-15T00:15:00Z");

    async function record(userId = USER) {
      const [row] = await getDb(env.DB)
        .select({
          at: users.lastSweepAt,
          toThisWeek: users.lastSweepMovedToThisWeek,
          toSomeday: users.lastSweepMovedToSomeday,
        })
        .from(users)
        .where(eq(users.id, userId));
      return row;
    }

    it("records when it ran and how many it moved each way", async () => {
      await seedUser(USER, "test@example.com", { timezone: "UTC" });
      const todayListId = await getListId(USER, "today");
      const thisWeekListId = await getListId(USER, "thisWeek");
      const old = new Date("2026-06-01T00:00:00Z");
      await seedTodo("550e8400-e29b-41d4-a716-446655440101", USER, {
        listId: todayListId,
        listEnteredAt: old,
      });
      await seedTodo("550e8400-e29b-41d4-a716-446655440102", USER, {
        listId: todayListId,
        listEnteredAt: old,
      });
      await seedTodo("550e8400-e29b-41d4-a716-446655440103", USER, {
        listId: thisWeekListId,
        listEnteredAt: old,
      });

      await runListSweep(getDb(env.DB), env, sweptAt);

      // The two that just arrived in This week aren't also counted as
      // moving on to Someday.
      expect(await record()).toEqual({
        at: sweptAt,
        toThisWeek: 2,
        toSomeday: 1,
      });
    });

    it("keeps the previous record when nothing moved", async () => {
      const earlier = new Date("2026-06-10T00:05:00Z");
      await seedUser(USER, "test@example.com", {
        timezone: "UTC",
        lastSweepAt: earlier,
        lastSweepMovedToThisWeek: 3,
        lastSweepMovedToSomeday: 0,
      });
      const todayListId = await getListId(USER, "today");
      // Arrived too recently to move.
      await seedTodo("550e8400-e29b-41d4-a716-446655440104", USER, {
        listId: todayListId,
        listEnteredAt: new Date("2026-06-14T20:00:00Z"),
      });

      await runListSweep(getDb(env.DB), env, sweptAt);

      expect(await record()).toEqual({
        at: earlier,
        toThisWeek: 3,
        toSomeday: 0,
      });
    });

    it("leaves a user who has never had anything move with no record", async () => {
      await seedUser(USER, "test@example.com", { timezone: "UTC" });
      await runListSweep(getDb(env.DB), env, sweptAt);
      expect(await record()).toEqual({ at: null, toThisWeek: 0, toSomeday: 0 });
    });

    it("only records for the users it swept", async () => {
      await seedUser("user_utc", "utc@example.com", { timezone: "UTC" });
      await seedUser("user_tokyo", "tokyo@example.com", {
        timezone: "Asia/Tokyo",
      });
      const old = new Date("2026-06-01T00:00:00Z");
      await seedTodo("550e8400-e29b-41d4-a716-446655440106", "user_utc", {
        listId: await getListId("user_utc", "today"),
        listEnteredAt: old,
      });
      await seedTodo("550e8400-e29b-41d4-a716-446655440107", "user_tokyo", {
        listId: await getListId("user_tokyo", "today"),
        listEnteredAt: old,
      });

      await runListSweep(getDb(env.DB), env, sweptAt);

      expect((await record("user_utc")).toThisWeek).toBe(1);
      expect(await record("user_tokyo")).toEqual({
        at: null,
        toThisWeek: 0,
        toSomeday: 0,
      });
    });

    it("bumps updatedAt on moved todos so delta sync sees them", async () => {
      await seedUser(USER, "test@example.com", { timezone: "UTC" });
      const todayListId = await getListId(USER, "today");
      const todoId = "550e8400-e29b-41d4-a716-446655440105";
      await seedTodo(todoId, USER, {
        listId: todayListId,
        listEnteredAt: new Date("2026-06-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
      });

      await runListSweep(getDb(env.DB), env, sweptAt);

      const [stored] = await getDb(env.DB)
        .select({ updatedAt: todos.updatedAt })
        .from(todos)
        .where(eq(todos.id, todoId));
      expect(stored.updatedAt).toEqual(sweptAt);
    });
  });
});
