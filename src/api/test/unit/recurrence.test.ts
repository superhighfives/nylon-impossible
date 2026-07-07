import {
  nextDueDate,
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
