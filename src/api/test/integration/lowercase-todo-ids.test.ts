import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import migration from "../../migrations/0004_lowercase_todo_ids.sql?raw";
import { cleanDb, getTodayListId, seedUser } from "../helpers";

// 0004 lowercases every todo ID and the columns that point at one. The rows
// it fixes were written by an old iOS POST /todos (uppercase `uuidString`),
// so they're seeded here with raw SQL, the way no current route would.

const USER = "user_test_123";
const PARENT = "AAAAAAAA-0000-4000-8000-000000000001";
const CHILD = "AAAAAAAA-0000-4000-8000-000000000002";
const TWIN = "BBBBBBBB-0000-4000-8000-000000000001";
const TWIN_CHILD = "BBBBBBBB-0000-4000-8000-000000000002";

/** Run the migration the way D1 does: its statements in one batch. */
async function runMigration() {
  const statements = migration
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
}

async function all<T>(sql: string, ...params: unknown[]) {
  const { results } = await env.DB.prepare(sql)
    .bind(...params)
    .all<T>();
  return results;
}

describe("0004_lowercase_todo_ids", () => {
  beforeEach(async () => {
    await cleanDb();
    await seedUser(USER);
    const listId = await getTodayListId(USER);

    const insertTodo = (id: string, title: string, parentId: string | null) =>
      env.DB.prepare(
        "INSERT INTO todos (id, user_id, list_id, title, parent_id, position) VALUES (?, ?, ?, ?, ?, 'a0')",
      ).bind(id, USER, listId, title, parentId);
    const insertUrl = (id: string, todoId: string, url: string) =>
      env.DB.prepare(
        "INSERT INTO todo_urls (id, todo_id, url, position) VALUES (?, ?, ?, 'a0')",
      ).bind(id, todoId, url);

    await env.DB.batch([
      env.DB.prepare("PRAGMA defer_foreign_keys = true"),
      // An uppercase todo with a link and an uppercase subtask.
      insertTodo(PARENT, "Parent", null),
      insertTodo(CHILD, "Child", PARENT),
      insertUrl("url-parent", PARENT, "https://example.com/parent"),
      // A twin pair: the lowercase row and its link stay; the uppercase
      // twin, its link and its subtask go.
      insertTodo(TWIN.toLowerCase(), "Twin (kept)", null),
      insertUrl("url-kept", TWIN.toLowerCase(), "https://example.com/kept"),
      insertTodo(TWIN, "Twin (deleted)", null),
      insertUrl("url-twin", TWIN, "https://example.com/twin"),
      insertTodo(TWIN_CHILD, "Twin's child", TWIN),
    ]);
  });

  async function expectMigrated() {
    expect(await all("SELECT id FROM todos WHERE id <> lower(id)")).toEqual([]);
    expect(
      await all("SELECT id FROM todos WHERE parent_id <> lower(parent_id)"),
    ).toEqual([]);
    expect(
      await all("SELECT id FROM todo_urls WHERE todo_id <> lower(todo_id)"),
    ).toEqual([]);
    expect(await all("PRAGMA foreign_key_check")).toEqual([]);

    // The link and the subtask hang off the lowercased todo.
    expect(
      await all(
        "SELECT id FROM todo_urls WHERE todo_id = ?",
        PARENT.toLowerCase(),
      ),
    ).toEqual([{ id: "url-parent" }]);
    expect(
      await all(
        "SELECT id FROM todos WHERE parent_id = ?",
        PARENT.toLowerCase(),
      ),
    ).toEqual([{ id: CHILD.toLowerCase() }]);

    // The twin pair ends as the lowercase row and its link, untouched.
    expect(
      await all(
        "SELECT id, title FROM todos WHERE lower(id) = ?",
        TWIN.toLowerCase(),
      ),
    ).toEqual([{ id: TWIN.toLowerCase(), title: "Twin (kept)" }]);
    expect(
      await all(
        "SELECT id FROM todo_urls WHERE todo_id = ?",
        TWIN.toLowerCase(),
      ),
    ).toEqual([{ id: "url-kept" }]);
    expect(await all("SELECT id FROM todo_urls WHERE id = 'url-twin'")).toEqual(
      [],
    );
    expect(
      await all(
        "SELECT id FROM todos WHERE lower(id) = ?",
        TWIN_CHILD.toLowerCase(),
      ),
    ).toEqual([]);

    expect(await all("SELECT id FROM todos ORDER BY id")).toHaveLength(3);
  }

  it("lowercases every todo ID and reference, and drops twins", async () => {
    await runMigration();
    await expectMigrated();
  });

  it("is a no-op the second time", async () => {
    await runMigration();
    const before = await all("SELECT * FROM todos ORDER BY id");
    const urlsBefore = await all("SELECT * FROM todo_urls ORDER BY id");
    await runMigration();
    expect(await all("SELECT * FROM todos ORDER BY id")).toEqual(before);
    expect(await all("SELECT * FROM todo_urls ORDER BY id")).toEqual(
      urlsBefore,
    );
    await expectMigrated();
  });
});
