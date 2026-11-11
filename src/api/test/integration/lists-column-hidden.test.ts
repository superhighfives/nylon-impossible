import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, lists } from "../../src/lib/db";
import { cleanDb, getTodayListId, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const HEADERS = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};
const USER = "user_test_123";

interface ListBody {
  id: string;
  columnHidden: boolean;
}

function patchList(id: string, body: object) {
  return SELF.fetch(`http://localhost/lists/${id}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
}

async function getLists() {
  const res = await SELF.fetch("http://localhost/lists", { headers: HEADERS });
  return res.json<ListBody[]>();
}

async function seedList(id: string) {
  await getDb(env.DB)
    .insert(lists)
    .values({ id, userId: USER, name: "Vinyls to buy", position: "b0" });
}

// A list's column can be left off a wide board's row (#645). Null in D1 (a
// list from before migration 0005, or one never hidden) reads as shown.
describe("lists columnHidden", () => {
  const LIST = "aaaaaaaa-0000-4000-8000-000000000645";

  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
    await seedUser();
    await seedList(LIST);
  });

  it("returns false for every list until one is hidden", async () => {
    const all = await getLists();
    expect(all).toHaveLength(4);
    expect(all.every((l) => l.columnHidden === false)).toBe(true);
  });

  it("hides and shows a list's column", async () => {
    const hidden = await patchList(LIST, { columnHidden: true });
    expect(hidden.status).toBe(200);
    expect(await hidden.json<ListBody>()).toMatchObject({
      id: LIST,
      columnHidden: true,
    });
    expect((await getLists()).find((l) => l.id === LIST)?.columnHidden).toBe(
      true,
    );

    const shown = await patchList(LIST, { columnHidden: false });
    expect(await shown.json<ListBody>()).toMatchObject({ columnHidden: false });
    expect((await getLists()).find((l) => l.id === LIST)?.columnHidden).toBe(
      false,
    );
  });

  it("leaves columnHidden alone on a rename", async () => {
    await patchList(LIST, { columnHidden: true });
    const renamed = await patchList(LIST, { name: "Records" });
    expect(await renamed.json<ListBody>()).toMatchObject({
      columnHidden: true,
    });
  });

  it("rejects a non-boolean", async () => {
    const res = await patchList(LIST, { columnHidden: "yes" });
    expect(res.status).toBe(400);
  });

  it("won't hide a system list", async () => {
    const today = await getTodayListId(USER);
    const res = await patchList(today, { columnHidden: true });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "system_list_immutable" });
    expect((await getLists()).find((l) => l.id === today)?.columnHidden).toBe(
      false,
    );
  });
});
