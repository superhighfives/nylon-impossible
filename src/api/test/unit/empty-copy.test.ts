import { EMPTY_COPY, EMPTY_NEXT, waitingIn } from "@nylon-impossible/shared";
import { describe, expect, it } from "vitest";

// Mirrored in the Apple app's EmptyCopyTests.
describe("EMPTY_COPY", () => {
  it("words each empty list as the apps do", () => {
    expect(EMPTY_COPY).toEqual({
      today: "Nothing today.",
      thisWeek: "A clear week.",
      someday: "Nothing here yet.",
      list: "Nothing here yet.",
    });
  });

  it("points Today at This week and This week at Someday", () => {
    expect(EMPTY_NEXT).toEqual({ today: "thisWeek", thisWeek: "someday" });
  });

  it("names the waiting list mid-sentence, with no period", () => {
    expect(waitingIn(4, "thisWeek")).toBe("4 waiting in this week");
    expect(waitingIn(1, "someday")).toBe("1 waiting in someday");
  });
});
