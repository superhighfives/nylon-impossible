import {
  dayKeyIn,
  daysBetweenKeys,
  dueDayKey,
  nextDueDate,
  placementForDueDate,
  toDueDay,
} from "@nylon-impossible/shared";
import { describe, expect, it } from "vitest";

describe("due day normalization", () => {
  it("leaves UTC midnight untouched", () => {
    const d = new Date("2026-08-28T00:00:00Z");
    expect(toDueDay(d).toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(dueDayKey(d)).toBe("2026-08-28");
  });

  it("recovers the day from a west-of-UTC local midnight", () => {
    // Pacific (UTC-7) local midnight on Aug 28.
    expect(dueDayKey("2026-08-28T07:00:00Z")).toBe("2026-08-28");
  });

  it("recovers the day from an east-of-UTC local midnight", () => {
    // Sydney (UTC+10) local midnight on Aug 28.
    expect(dueDayKey("2026-08-27T14:00:00Z")).toBe("2026-08-28");
  });

  it("reads today in the user's zone, not UTC", () => {
    // 18:00 Pacific on Aug 27 is already Aug 28 in UTC.
    const now = new Date("2026-08-28T01:00:00Z");
    expect(dayKeyIn(now, "America/Los_Angeles")).toBe("2026-08-27");
    expect(dayKeyIn(now, "UTC")).toBe("2026-08-28");
    expect(dayKeyIn(now, "Not/AZone")).toBe("2026-08-28");
  });

  it("counts whole days between keys", () => {
    expect(daysBetweenKeys("2026-08-27", "2026-08-28")).toBe(1);
    expect(daysBetweenKeys("2026-08-28", "2026-08-21")).toBe(-7);
  });
});

describe("recurrence on calendar days", () => {
  it("doesn't skip tomorrow when a Pacific user completes in the evening", () => {
    // Due Aug 27, completed at 18:00 Pacific on Aug 27 (01:00Z Aug 28).
    const next = nextDueDate(
      { frequency: "daily" },
      new Date("2026-08-27T00:00:00Z"),
      new Date("2026-08-28T01:00:00Z"),
      "America/Los_Angeles",
    );
    expect(dueDayKey(next)).toBe("2026-08-28");
  });

  it("places a repeat due tomorrow in the user's zone into Today", () => {
    expect(
      placementForDueDate(
        new Date("2026-08-28T00:00:00Z"),
        new Date("2026-08-28T01:00:00Z"),
        "America/Los_Angeles",
      ),
    ).toBe("today");
  });
});
