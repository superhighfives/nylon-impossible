import {
  nextDueDate,
  placementForDueDate,
  previousDueDate,
} from "@nylon-impossible/shared/recurrence";
import {
  previousDueDateFixtures,
  recurrenceFixtures,
} from "@nylon-impossible/shared/recurrence-test-fixtures";
import { describe, expect, it } from "vitest";

describe("nextDueDate", () => {
  for (const fixture of recurrenceFixtures) {
    it(fixture.name, () => {
      const result = nextDueDate(
        { frequency: fixture.frequency },
        new Date(fixture.from),
        new Date(fixture.now),
      );
      expect(result.toISOString()).toBe(
        new Date(fixture.expected).toISOString(),
      );
    });
  }
});

describe("placementForDueDate", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("places a due date later today in Today", () => {
    expect(placementForDueDate(new Date("2026-06-15T23:00:00.000Z"), now)).toBe(
      "today",
    );
  });

  it("places a due date earlier today (already past) in Today", () => {
    expect(placementForDueDate(new Date("2026-06-15T00:30:00.000Z"), now)).toBe(
      "today",
    );
  });

  it("places tomorrow in Today", () => {
    expect(placementForDueDate(new Date("2026-06-16T09:00:00.000Z"), now)).toBe(
      "today",
    );
  });

  it("places 2 days out in This Week", () => {
    expect(placementForDueDate(new Date("2026-06-17T09:00:00.000Z"), now)).toBe(
      "thisWeek",
    );
  });

  it("places exactly 7 days out in This Week", () => {
    expect(placementForDueDate(new Date("2026-06-22T09:00:00.000Z"), now)).toBe(
      "thisWeek",
    );
  });

  it("places 8 days out in Sometime", () => {
    expect(placementForDueDate(new Date("2026-06-23T09:00:00.000Z"), now)).toBe(
      "sometime",
    );
  });

  it("places a due date months out in Sometime", () => {
    expect(placementForDueDate(new Date("2026-12-25T09:00:00.000Z"), now)).toBe(
      "sometime",
    );
  });

  it("uses calendar-day distance, not 24h windows", () => {
    // now is 12:00 UTC; a due date at 00:30 UTC the next calendar day is
    // less than 24h away but still counts as "tomorrow", not "later today".
    const lateNow = new Date("2026-06-15T23:50:00.000Z");
    expect(
      placementForDueDate(new Date("2026-06-16T00:30:00.000Z"), lateNow),
    ).toBe("today");
  });
});

describe("previousDueDate", () => {
  for (const fixture of previousDueDateFixtures) {
    it(fixture.name, () => {
      const result = previousDueDate(
        { frequency: fixture.frequency },
        new Date(fixture.from),
      );
      expect(result.toISOString()).toBe(
        new Date(fixture.expected).toISOString(),
      );
    });
  }
});
