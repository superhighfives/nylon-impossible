import { describe, expect, it } from "vitest";
import { formatDueDate, isDueDateOverdue, relativeDueDay } from "../date";
import { recurrenceLabel } from "../recurrence";

// 18:00 Pacific on Thu Aug 27 2026 — already Aug 28 in UTC.
const PACIFIC_EVENING = new Date("2026-08-28T01:00:00Z");
const LA = "America/Los_Angeles";

describe("due dates are calendar days", () => {
  it("formats the picked day, not the previous one west of UTC", () => {
    expect(
      formatDueDate("2026-08-28T00:00:00Z", { month: "short", day: "numeric" }),
    ).toMatch(/28/);
  });

  it("reads a legacy local-midnight value as its intended day", () => {
    expect(
      formatDueDate("2026-08-28T07:00:00Z", { month: "short", day: "numeric" }),
    ).toMatch(/28/);
  });

  it("isn't overdue until the user's day has passed", () => {
    const dueToday = "2026-08-27T00:00:00Z";
    expect(isDueDateOverdue(dueToday, LA, PACIFIC_EVENING)).toBe(false);
    expect(isDueDateOverdue(dueToday, "UTC", PACIFIC_EVENING)).toBe(true);
  });

  it("labels tomorrow relative to the user's day", () => {
    expect(relativeDueDay("2026-08-28T00:00:00Z", LA, PACIFIC_EVENING)).toBe(
      "Tomorrow",
    );
  });

  it("names the due day's own weekday in recurrence labels", () => {
    // Aug 28 2026 is a Friday.
    expect(
      recurrenceLabel(
        { frequency: "weekly" },
        new Date("2026-08-28T00:00:00Z"),
      ),
    ).toBe("Weekly on Friday");
  });
});
