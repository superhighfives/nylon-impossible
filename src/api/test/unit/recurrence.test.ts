import { nextDueDate } from "@nylon-impossible/shared/recurrence";
import { recurrenceFixtures } from "@nylon-impossible/shared/recurrence-test-fixtures";
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
