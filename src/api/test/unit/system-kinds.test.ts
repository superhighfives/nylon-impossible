import { BOARD_TIME_KINDS } from "@nylon-impossible/shared";
import { lists } from "@nylon-impossible/shared/schema";
import { describe, expect, it } from "vitest";

// The schema keeps its own copy of the time lists so the column definition
// stays self-contained for drizzle-kit (#618). This keeps the two in step.
describe("lists.systemKind", () => {
  it("has the same values, in the same order, as BOARD_TIME_KINDS", () => {
    expect(lists.systemKind.enumValues).toEqual([...BOARD_TIME_KINDS]);
  });
});
