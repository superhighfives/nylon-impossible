import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, getDb, lists, todos } from "../../src/lib/db";
import { cleanDb, getTodayListId, seedTodo, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const HEADERS = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};
const USER = "user_test_123";
const OTHER = "user_other_456";
const OWN = "aaaaaaaa-0000-4000-8000-000000000794";
const THEIRS = "bbbbbbbb-0000-4000-8000-000000000794";
const UNKNOWN = "cccccccc-0000-4000-8000-000000000794";
const SEEDED_AT = new Date("2020-01-01T00:00:00.000Z");

interface ListBody {
  id: string;
  name: string;
  position: string;
  updatedAt: string;
}

function send(method: "PATCH" | "DELETE", id: string, body?: object) {
  return SELF.fetch(`http://localhost/lists/${id}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function seedList(id: string, userId: string) {
  await getDb(env.DB).insert(lists).values({
    id,
    userId,
    name: "Vinyls to buy",
    position: "b0",
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  });
}

async function listExists(id: string) {
  const rows = await getDb(env.DB)
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.id, id));
  return rows.length > 0;
}

// PATCH and DELETE /lists/:id share one ownership check (#794): someone
// else's list or an unknown id is a 404, a system list is a 403.
describe("PATCH and DELETE /lists/:id", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
    await seedUser(USER);
    await seedUser(OTHER, "other@example.com");
    await seedList(OWN, USER);
    await seedList(THEIRS, OTHER);
  });

  describe("PATCH", () => {
    it("is a 404 for another user's list, and leaves it alone", async () => {
      const res = await send("PATCH", THEIRS, { name: "Mine now" });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: "list_not_found" });
      const [row] = await getDb(env.DB)
        .select({ name: lists.name })
        .from(lists)
        .where(eq(lists.id, THEIRS));
      expect(row.name).toBe("Vinyls to buy");
    });

    it("is a 404 for an unknown id", async () => {
      const res = await send("PATCH", UNKNOWN, { name: "Records" });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: "list_not_found" });
    });

    it("is a 403 for a system list", async () => {
      const today = await getTodayListId(USER);
      const res = await send("PATCH", today, { name: "Now" });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        code: "system_list_immutable",
      });
    });

    it("returns the caller's own list as it is after the update", async () => {
      const res = await send("PATCH", OWN.toUpperCase(), {
        name: "Records",
        position: "c0",
      });
      expect(res.status).toBe(200);
      const body = await res.json<ListBody>();
      expect(body).toMatchObject({ id: OWN, name: "Records", position: "c0" });
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
        SEEDED_AT.getTime(),
      );
    });
  });

  describe("DELETE", () => {
    it("is a 404 for another user's list, and leaves it alone", async () => {
      const res = await send("DELETE", THEIRS);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: "list_not_found" });
      expect(await listExists(THEIRS)).toBe(true);
    });

    it("is a 404 for an unknown id", async () => {
      const res = await send("DELETE", UNKNOWN);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: "list_not_found" });
    });

    it("is a 403 for a system list, and leaves it alone", async () => {
      const today = await getTodayListId(USER);
      const res = await send("DELETE", today);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        code: "system_list_immutable",
      });
      expect(await listExists(today)).toBe(true);
    });

    it("deletes the caller's own list and its todos", async () => {
      await seedTodo("dddddddd-0000-4000-8000-000000000794", USER, {
        listId: OWN,
      });
      const res = await send("DELETE", OWN);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, deletedTodoCount: 1 });
      expect(await listExists(OWN)).toBe(false);
      const left = await getDb(env.DB)
        .select({ id: todos.id })
        .from(todos)
        .where(eq(todos.listId, OWN));
      expect(left).toHaveLength(0);
    });
  });
});
