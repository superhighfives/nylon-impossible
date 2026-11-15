import { env } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import type {
  V1List,
  V1ListsResponse,
  V1Todo,
  V1TodosResponse,
} from "@nylon-impossible/shared/api-v1";
import { beforeEach, describe, expect, it, type vi } from "vitest";
import { getDb, lists, todos, todoUrls } from "../../src/lib/db";
import {
  callWorker,
  cleanDb,
  createApiToken,
  getTodayListId,
  seedUser,
} from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;

const USER = "user_test_123";
const OTHER = "user_other_456";
const at = (iso: string) => new Date(iso);

let token: string;
const get = (path: string) => callWorker(path, { token });

async function systemListIds(userId = USER) {
  const rows = await getDb(env.DB).select().from(lists);
  const of = (kind: string) =>
    rows.find((l) => l.userId === userId && l.systemKind === kind)?.id ?? "";
  return {
    today: of("today"),
    thisWeek: of("thisWeek"),
    someday: of("someday"),
  };
}

describe("/v1", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
    await seedUser(USER);
    ({ token } = await createApiToken());
  });

  describe("shapes and order", () => {
    let ids: Awaited<ReturnType<typeof systemListIds>>;

    beforeEach(async () => {
      const db = getDb(env.DB);
      ids = await systemListIds();
      await db.insert(lists).values([
        {
          id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          userId: USER,
          name: "Errands",
          kind: "custom",
          position: "a4",
          updatedAt: at("2026-11-01T10:00:00.000Z"),
        },
        {
          id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          userId: USER,
          name: "Work",
          kind: "custom",
          position: "a3",
          updatedAt: at("2026-11-01T11:00:00.000Z"),
        },
      ]);
      await db.update(lists).set({ updatedAt: at("2026-11-02T09:00:00.000Z") });

      const base = {
        userId: USER,
        listId: ids.today,
        createdAt: at("2026-11-01T08:00:00.000Z"),
        updatedAt: at("2026-11-02T08:00:00.000Z"),
      };
      await db.insert(todos).values([
        // Inserted out of order: the API sorts pinned first, then position.
        {
          ...base,
          id: "todo-repeat",
          title: "Water the plants",
          position: "a2",
          dueDate: at("2026-11-04T00:00:00.000Z"),
          recurrence: { frequency: "weekly" },
        },
        { ...base, id: "todo-plain", title: "Call Sam", position: "a0" },
        {
          ...base,
          id: "todo-pinned",
          title: "Ship the public API",
          notes: "Docs first.",
          pinned: true,
          position: "a5",
          dueDate: at("2026-11-03T00:00:00.000Z"),
        },
        {
          ...base,
          id: "todo-done",
          title: "Old thing",
          completed: true,
          position: "a1",
        },
        {
          ...base,
          id: "todo-elsewhere",
          title: "In Someday",
          listId: ids.someday,
          position: "a0",
        },
      ]);
      await db.insert(todos).values([
        {
          ...base,
          id: "sub-2",
          parentId: "todo-pinned",
          title: "Ship it",
          position: "a1",
        },
        {
          ...base,
          id: "sub-1",
          parentId: "todo-pinned",
          title: "Write tests",
          completed: true,
          position: "a0",
        },
      ]);
      await db.insert(todoUrls).values([
        {
          id: "link-2",
          todoId: "todo-pinned",
          url: "https://example.com/raw",
          showPreview: false,
          position: "a1",
        },
        {
          id: "link-1",
          todoId: "todo-pinned",
          url: "https://nylonimpossible.com/docs/api",
          title: "API",
          siteName: "Nylon Impossible",
          description: "never sent",
          fetchStatus: "fetched",
          position: "a0",
        },
      ]);
    });

    const pinned = (listId: string): V1Todo => ({
      id: "todo-pinned",
      listId,
      title: "Ship the public API",
      notes: "Docs first.",
      pinned: true,
      done: false,
      due: "2026-11-03",
      repeat: null,
      links: [
        {
          id: "link-1",
          url: "https://nylonimpossible.com/docs/api",
          title: "API",
          siteName: "Nylon Impossible",
          showAsUrl: false,
        },
        {
          id: "link-2",
          url: "https://example.com/raw",
          title: null,
          siteName: null,
          showAsUrl: true,
        },
      ],
      subtasks: [
        { id: "sub-1", title: "Write tests", done: true },
        { id: "sub-2", title: "Ship it", done: false },
      ],
      createdAt: "2026-11-01T08:00:00.000Z",
      updatedAt: "2026-11-02T08:00:00.000Z",
    });

    const plain = (listId: string, id: string, title: string): V1Todo => ({
      id,
      listId,
      title,
      notes: null,
      pinned: false,
      done: false,
      due: null,
      repeat: null,
      links: [],
      subtasks: [],
      createdAt: "2026-11-01T08:00:00.000Z",
      updatedAt: "2026-11-02T08:00:00.000Z",
    });

    it("GET /v1/lists: the time lists, then your lists by position", async () => {
      const res = await get("/v1/lists");
      expect(res.status).toBe(200);
      const updatedAt = "2026-11-02T09:00:00.000Z";
      expect(await res.json<V1ListsResponse>()).toEqual({
        data: [
          { id: ids.today, name: "Today", kind: "today", updatedAt },
          { id: ids.thisWeek, name: "This week", kind: "this_week", updatedAt },
          { id: ids.someday, name: "Someday", kind: "someday", updatedAt },
          {
            id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "Work",
            kind: "list",
            updatedAt,
          },
          {
            id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            name: "Errands",
            kind: "list",
            updatedAt,
          },
        ],
      });
    });

    it.each([
      ["today", "today", "Today", "today"],
      ["this-week", "thisWeek", "This week", "this_week"],
      ["someday", "someday", "Someday", "someday"],
    ] as const)(
      "GET /v1/lists/%s resolves the alias",
      async (alias, key, name, kind) => {
        const res = await get(`/v1/lists/${alias}`);
        expect(res.status).toBe(200);
        expect(await res.json<V1List>()).toEqual({
          id: ids[key],
          name,
          kind,
          updatedAt: "2026-11-02T09:00:00.000Z",
        });
      },
    );

    it("GET /v1/lists/:id by id", async () => {
      const res = await get("/v1/lists/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(await res.json<V1List>()).toEqual({
        id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Work",
        kind: "list",
        updatedAt: "2026-11-02T09:00:00.000Z",
      });
    });

    it("GET /v1/lists/today/todos: open top-level todos in app order, full bodies", async () => {
      const res = await get("/v1/lists/today/todos");
      expect(res.status).toBe(200);
      const body = await res.json<V1TodosResponse>();
      expect(body).toEqual({
        data: [
          pinned(ids.today),
          plain(ids.today, "todo-plain", "Call Sam"),
          {
            ...plain(ids.today, "todo-repeat", "Water the plants"),
            due: "2026-11-04",
            repeat: { frequency: "weekly" },
          },
        ],
        nextCursor: null,
      });
      const text = JSON.stringify(body);
      for (const internal of [
        "userId",
        "user_test_123",
        "test@example.com",
        "position",
        "systemKind",
        "fetchStatus",
        "never sent",
      ]) {
        expect(text).not.toContain(internal);
      }
    });

    it("the same list by id gives the same todos", async () => {
      const byAlias = await (await get("/v1/lists/today/todos")).json();
      const byId = await (await get(`/v1/lists/${ids.today}/todos`)).json();
      expect(byId).toEqual(byAlias);
    });

    it("?done=true returns done todos instead", async () => {
      const res = await get("/v1/lists/today/todos?done=true");
      expect(await res.json<V1TodosResponse>()).toEqual({
        data: [{ ...plain(ids.today, "todo-done", "Old thing"), done: true }],
        nextCursor: null,
      });
    });

    it("GET /v1/todos/:id: one top-level todo, done or not", async () => {
      const res = await get("/v1/todos/todo-pinned");
      expect(res.status).toBe(200);
      expect(await res.json<V1Todo>()).toEqual(pinned(ids.today));

      const done = await get("/v1/todos/todo-done");
      expect((await done.json<V1Todo>()).done).toBe(true);
    });

    it("GET /v1/todos/:id finds an id sent in uppercase", async () => {
      const res = await get("/v1/todos/TODO-PINNED");
      expect(res.status).toBe(200);
    });
  });

  describe("paging", () => {
    beforeEach(async () => {
      const db = getDb(env.DB);
      const listId = await getTodayListId(USER);
      const rows = Array.from({ length: 7 }, (_, i) => ({
        id: `open-${i}`,
        userId: USER,
        listId,
        title: `Open ${i}`,
        position: `a${i}`,
        pinned: i === 5,
      }));
      const done = Array.from({ length: 5 }, (_, i) => ({
        id: `done-${i}`,
        userId: USER,
        listId,
        title: `Done ${i}`,
        position: "a0",
        completed: true,
        // done-3 and done-4 share a second, so the id breaks the tie.
        updatedAt: at(`2026-11-0${Math.min(i, 3) + 1}T10:00:00.000Z`),
      }));
      await db.insert(todos).values([...rows, ...done]);
    });

    async function all(path: string, limit: number) {
      const pages: string[][] = [];
      let cursor: string | null = null;
      do {
        const q = new URLSearchParams({ limit: String(limit) });
        if (cursor) q.set("cursor", cursor);
        const res = await get(`${path}${path.includes("?") ? "&" : "?"}${q}`);
        expect(res.status).toBe(200);
        const body: V1TodosResponse = await res.json();
        expect(body.data.length).toBeLessThanOrEqual(limit);
        pages.push(body.data.map((t) => t.id));
        cursor = body.nextCursor;
      } while (cursor);
      return pages;
    }

    it("pages open todos in app order, with nextCursor null on the last page", async () => {
      expect(await all("/v1/lists/today/todos", 3)).toEqual([
        ["open-5", "open-0", "open-1"],
        ["open-2", "open-3", "open-4"],
        ["open-6"],
      ]);
    });

    it("pages done todos, most recently changed first", async () => {
      expect(await all("/v1/lists/today/todos?done=true", 2)).toEqual([
        ["done-4", "done-3"],
        ["done-2", "done-1"],
        ["done-0"],
      ]);
    });

    it("a page that ends exactly on the last todo has no nextCursor", async () => {
      const res = await get("/v1/lists/today/todos?limit=7");
      const body = await res.json<V1TodosResponse>();
      expect(body.data).toHaveLength(7);
      expect(body.nextCursor).toBeNull();
    });

    it("defaults to 100 and allows up to 500", async () => {
      expect((await get("/v1/lists/today/todos?limit=500")).status).toBe(200);
      const body = await (
        await get("/v1/lists/today/todos")
      ).json<V1TodosResponse>();
      expect(body.data).toHaveLength(7);
    });

    it.each([
      "limit=501",
      "limit=0",
      "limit=ten",
      "done=yes",
      "cursor=nonsense",
    ])("?%s gets 400 validation_failed", async (query) => {
      const res = await get(`/v1/lists/today/todos?${query}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "validation_failed" });
    });

    it("an open-todos cursor isn't accepted for done todos", async () => {
      const first = await (
        await get("/v1/lists/today/todos?limit=1")
      ).json<V1TodosResponse>();
      const res = await get(
        `/v1/lists/today/todos?done=true&cursor=${first.nextCursor}`,
      );
      expect(res.status).toBe(400);
    });
  });

  describe("not found", () => {
    let otherListId: string;

    beforeEach(async () => {
      await seedUser(OTHER, "other@example.com");
      otherListId = (await systemListIds(OTHER)).today;
      const db = getDb(env.DB);
      await db.insert(todos).values([
        { id: "theirs", userId: OTHER, listId: otherListId, title: "Theirs" },
        {
          id: "mine",
          userId: USER,
          listId: (await systemListIds()).today,
          title: "Mine",
        },
        {
          id: "my-subtask",
          userId: USER,
          parentId: "mine",
          listId: (await systemListIds()).today,
          title: "Sub",
        },
      ]);
    });

    async function expect404(path: string, code: string) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code });
    }

    it("another user's list is the same 404 as an unknown one", async () => {
      const unknown = await (
        await get("/v1/lists/ffffffffffffffffffffffffffffffff")
      ).json();
      const theirs = await (await get(`/v1/lists/${otherListId}`)).json();
      expect(theirs).toEqual(unknown);
      expect(theirs).toEqual({
        error: "List not found",
        code: "list_not_found",
      });
      await expect404(`/v1/lists/${otherListId}/todos`, "list_not_found");
      await expect404("/v1/lists/not-a-list/todos", "list_not_found");
    });

    it("another user's todo, and a subtask, are the same 404 as an unknown one", async () => {
      const unknown = await (await get("/v1/todos/nope")).json();
      expect(unknown).toEqual({
        error: "Todo not found",
        code: "todo_not_found",
      });
      expect(await (await get("/v1/todos/theirs")).json()).toEqual(unknown);
      expect(await (await get("/v1/todos/my-subtask")).json()).toEqual(unknown);
      await expect404("/v1/todos/theirs", "todo_not_found");
      expect((await get("/v1/todos/mine")).status).toBe(200);
    });
  });
});
