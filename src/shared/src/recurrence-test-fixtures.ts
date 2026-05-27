import type { RecurrenceFrequency } from "./schema";

/**
 * Parity fixtures shared between the TS test (recurrence.test.ts) and the
 * Swift test (RecurrenceTests.swift). If you add a case here, mirror the same
 * row in `RecurrenceTests.fixtures` so both implementations stay in lockstep.
 *
 * Timestamps are ISO 8601 in UTC so they parse identically in JS and Swift.
 */
export interface RecurrenceFixture {
  name: string;
  frequency: RecurrenceFrequency;
  from: string;
  now: string;
  expected: string;
}

export const recurrenceFixtures: RecurrenceFixture[] = [
  {
    name: "daily — single advance when due tomorrow",
    frequency: "daily",
    from: "2026-03-21T09:00:00Z",
    now: "2026-03-21T12:00:00Z",
    expected: "2026-03-22T09:00:00Z",
  },
  {
    name: "daily — skips a week of missed occurrences in one step",
    frequency: "daily",
    from: "2026-03-21T09:00:00Z",
    now: "2026-03-28T10:00:00Z",
    expected: "2026-03-29T09:00:00Z",
  },
  {
    name: "weekly — advances by seven days",
    frequency: "weekly",
    from: "2026-03-18T09:00:00Z",
    now: "2026-03-18T20:00:00Z",
    expected: "2026-03-25T09:00:00Z",
  },
  {
    name: "monthly — clamps Jan 31 to Feb 28 in a non-leap year",
    frequency: "monthly",
    from: "2027-01-31T09:00:00Z",
    now: "2027-01-31T10:00:00Z",
    expected: "2027-02-28T09:00:00Z",
  },
  {
    name: "monthly — clamps Jan 31 to Feb 29 in a leap year",
    frequency: "monthly",
    from: "2028-01-31T09:00:00Z",
    now: "2028-01-31T10:00:00Z",
    expected: "2028-02-29T09:00:00Z",
  },
  {
    name: "monthly — does not over-clamp on a 30-day month",
    frequency: "monthly",
    from: "2026-03-31T09:00:00Z",
    now: "2026-03-31T10:00:00Z",
    expected: "2026-04-30T09:00:00Z",
  },
  {
    name: "yearly — Feb 29 falls back to Feb 28 in a non-leap year",
    frequency: "yearly",
    from: "2028-02-29T09:00:00Z",
    now: "2028-02-29T10:00:00Z",
    expected: "2029-02-28T09:00:00Z",
  },
  {
    name: "next > now is strict — completing exactly at due time still advances once",
    frequency: "daily",
    from: "2026-03-21T09:00:00Z",
    now: "2026-03-21T09:00:00Z",
    expected: "2026-03-22T09:00:00Z",
  },
];
