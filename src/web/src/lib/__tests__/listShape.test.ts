import { serializeList } from "@nylon-impossible/shared/serialize";
import { describe, expect, it } from "vitest";
import { listUpdates } from "../listShape";
import type { List } from "../schema";

const at = new Date("2026-11-11T09:30:00.000Z");
const list: List = {
  id: "list-vinyl",
  userId: "user_ABC",
  name: "Vinyls to buy",
  kind: "custom",
  systemKind: null,
  position: "b0",
  columnHidden: null,
  createdAt: at,
  updatedAt: at,
};

// getLists and updateList answer with this shape; #645's hidden columns.
describe("serializeList", () => {
  it("reads a list never hidden (null) as shown", () => {
    expect(serializeList(list).columnHidden).toBe(false);
  });

  it("returns a hidden list's columnHidden", () => {
    expect(serializeList({ ...list, columnHidden: true }).columnHidden).toBe(
      true,
    );
  });
});

describe("listUpdates", () => {
  it("writes columnHidden, hiding and showing", () => {
    expect(listUpdates({ columnHidden: true })).toEqual({ columnHidden: true });
    expect(listUpdates({ columnHidden: false })).toEqual({
      columnHidden: false,
    });
  });

  it("leaves columnHidden out of a rename", () => {
    expect(listUpdates({ name: "Records" })).toEqual({ name: "Records" });
  });
});
