import { describe, expect, it } from "vitest";
import { isLocalMidnightHour } from "../../src/lib/list-sweep";

describe("isLocalMidnightHour", () => {
  it("is true at UTC midnight in UTC", () => {
    expect(isLocalMidnightHour("UTC", new Date("2026-06-15T00:30:00Z"))).toBe(
      true,
    );
  });

  it("is false an hour after UTC midnight in UTC", () => {
    expect(isLocalMidnightHour("UTC", new Date("2026-06-15T01:30:00Z"))).toBe(
      false,
    );
  });

  it("is true when it's local midnight in a positive-offset timezone, even though it isn't UTC midnight", () => {
    // Tokyo is UTC+9, so 15:30 UTC is 00:30 the next day in Tokyo.
    expect(
      isLocalMidnightHour("Asia/Tokyo", new Date("2026-06-15T15:30:00Z")),
    ).toBe(true);
    expect(
      isLocalMidnightHour("Asia/Tokyo", new Date("2026-06-15T14:30:00Z")),
    ).toBe(false);
  });

  it("is true when it's local midnight in a negative-offset timezone", () => {
    // Los Angeles is UTC-7 in June (PDT), so 07:30 UTC is 00:30 in LA.
    expect(
      isLocalMidnightHour(
        "America/Los_Angeles",
        new Date("2026-06-15T07:30:00Z"),
      ),
    ).toBe(true);
    expect(
      isLocalMidnightHour(
        "America/Los_Angeles",
        new Date("2026-06-15T06:30:00Z"),
      ),
    ).toBe(false);
  });

  it("never sweeps on an invalid/unknown IANA identifier rather than guessing", () => {
    expect(
      isLocalMidnightHour("Not/A_Real_Timezone", new Date("2026-06-15T00:30:00Z")),
    ).toBe(false);
    expect(isLocalMidnightHour("", new Date("2026-06-15T00:30:00Z"))).toBe(
      false,
    );
  });
});
