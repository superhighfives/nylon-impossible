import { buildSeedSql } from "@nylon-impossible/shared/seed-account";
import { describe, expect, it } from "vitest";

// The API's list-id pattern (src/api/src/lib/list-id.ts); seeded rows have to
// pass it or every write that names a list is rejected.
const LIST_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;

const seed = (idPrefix?: string) =>
  buildSeedSql({
    userId: "user_1",
    email: "a@example.com",
    timeZone: "UTC",
    now: new Date("2026-11-18T12:00:00Z"),
    idPrefix,
  });

describe("buildSeedSql ids", () => {
  it("makes every row id a valid UUID", () => {
    const ids = [...seed("smoke-727-").matchAll(/VALUES \('([^']+)'/g)].map(
      (m) => m[1],
    );
    const rows = ids.filter((i) => i !== "user_1");
    expect(rows.length).toBeGreaterThan(10);
    for (const id of rows) expect(id).toMatch(LIST_ID);
  });

  it("is deterministic and differs per prefix", () => {
    expect(seed("a-")).toBe(seed("a-"));
    expect(seed("a-")).not.toBe(seed("b-"));
  });

  it("clears old rows by exact id", () => {
    expect(seed()).not.toContain("LIKE");
    expect(seed()).toMatch(/DELETE FROM lists WHERE id IN \('/);
  });
});
