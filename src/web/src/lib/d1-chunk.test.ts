import { chunkForD1, D1_MAX_BOUND_PARAMS } from "@nylon-impossible/shared/d1";
import { describe, expect, it } from "vitest";

// Guards the shared batching that both getTodos (web) and syncTodos (api) rely
// on to stay under D1's bound-parameter cap. The production outage was a query
// with one bound param per todoId overflowing that cap once a user crossed 100
// todos; these cases pin the boundary so an off-by-one can't reintroduce it.
describe("chunkForD1", () => {
  it("keeps exactly the cap in a single batch", () => {
    const ids = Array.from({ length: D1_MAX_BOUND_PARAMS }, (_, i) => i);
    expect(chunkForD1(ids).map((b) => b.length)).toEqual([D1_MAX_BOUND_PARAMS]);
  });

  it("splits one past the cap into two batches (the outage boundary)", () => {
    const ids = Array.from({ length: D1_MAX_BOUND_PARAMS + 1 }, (_, i) => i);
    expect(chunkForD1(ids).map((b) => b.length)).toEqual([
      D1_MAX_BOUND_PARAMS,
      1,
    ]);
  });

  it("never emits a batch larger than the cap and preserves every id in order", () => {
    const ids = Array.from({ length: 250 }, (_, i) => i);
    const batches = chunkForD1(ids);
    expect(Math.max(...batches.map((b) => b.length))).toBeLessThanOrEqual(
      D1_MAX_BOUND_PARAMS,
    );
    expect(batches.flat()).toEqual(ids);
  });

  it("returns no batches for an empty list", () => {
    expect(chunkForD1([])).toEqual([]);
  });
});
