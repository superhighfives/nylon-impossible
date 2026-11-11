// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { ensureSystemLists } from "./lists";
import * as schema from "./schema";

const MIGRATIONS_DIR = path.join(__dirname, "../../../api/migrations");

// The three D1 statement methods Drizzle calls, backed by node:sqlite, with
// the API's real migrations applied. The unique index on
// (user_id, system_kind) is what this test is about, so a mock won't do.
function createTestD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (file.endsWith(".sql")) {
      sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    }
  }

  function prepare(query: string) {
    return {
      bind(...params: (string | number | null)[]) {
        return {
          async all() {
            return { results: sqlite.prepare(query).all(...params) };
          },
          async raw() {
            const statement = sqlite.prepare(query);
            statement.setReturnArrays(true);
            return statement.all(...params);
          },
          async run() {
            sqlite.prepare(query).run(...params);
            return { success: true, meta: {} };
          },
        };
      },
    };
  }

  return { prepare } as unknown as D1Database;
}

// A Drizzle client over a fresh database holding one user, user_1.
async function createTestDb() {
  const db = drizzle(createTestD1(), { schema });
  await db.run(
    sql`insert into users (id, email) values ('user_1', 'new@example.com')`,
  );
  return db;
}

describe("ensureSystemLists", () => {
  // NYLON-IMPOSSIBLE-WEB-9: a new user's first page load runs several server
  // functions at once. Each passed the "no Today list yet" check before any
  // inserted, and every insert after the first threw on the unique index.
  it("lets concurrent first calls for a new user all succeed", async () => {
    const db = await createTestDb();

    const results = await Promise.all([
      ensureSystemLists(db, "user_1"),
      ensureSystemLists(db, "user_1"),
      ensureSystemLists(db, "user_1"),
    ]);

    const created = results.filter((r) => r !== null);
    expect(created).toHaveLength(1);
    expect(created[0]?.map((l) => l.systemKind)).toEqual([
      "today",
      "thisWeek",
      "someday",
    ]);
    expect(await db.query.lists.findMany()).toHaveLength(3);
  });

  it("returns null once the lists exist", async () => {
    const db = await createTestDb();

    expect(await ensureSystemLists(db, "user_1")).toHaveLength(3);
    expect(await ensureSystemLists(db, "user_1")).toBeNull();
  });
});
