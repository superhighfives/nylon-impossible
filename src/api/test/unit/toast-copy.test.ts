import { addedToast, dueLabel } from "@nylon-impossible/shared";
import { describe, expect, it } from "vitest";

// Mirrored in the Apple app's ToastCopyTests.
describe("addedToast", () => {
  it("names the list for one todo", () => {
    expect(addedToast(1, "someday")).toBe("Added to someday");
    expect(addedToast(1, "Groceries")).toBe("Added to Groceries");
  });

  it("counts several todos", () => {
    expect(addedToast(3, "someday")).toBe("3 todos added to someday");
  });

  it("adds the due day, lowercase where it's a relative day", () => {
    // A Monday in UTC.
    const now = new Date("2026-10-19T09:00:00Z");
    const due = (day: string) => dueLabel(day, now, "UTC").text;
    expect(addedToast(1, "today", due("2026-10-19"))).toBe(
      "Added to today · due today",
    );
    expect(addedToast(1, "today", due("2026-10-20"))).toBe(
      "Added to today · due tomorrow",
    );
    expect(addedToast(1, "this week", due("2026-10-23"))).toBe(
      "Added to this week · due Fri",
    );
    expect(addedToast(2, "someday", due("2027-03-03"))).toBe(
      "2 todos added to someday · due Mar 3",
    );
  });

  it("leaves the suffix off with no due day", () => {
    expect(addedToast(1, "today", null)).toBe("Added to today");
  });
});
