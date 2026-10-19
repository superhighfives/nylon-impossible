import { dueDayKey, parseTodoDate } from "@nylon-impossible/shared";
import fixtures from "@nylon-impossible/shared/todo-date-fixtures.json";
import { describe, expect, it } from "vitest";

// The same JSON drives TodoDateParserTests.swift, so the TS parser and its
// Swift mirror are held to one set of answers.
interface TodoDateFixture {
  name: string;
  text: string;
  now: string;
  timeZone: string;
  expected: { title: string; dueDay: string | null; matched: string | null };
}

const cases = (fixtures as { cases: TodoDateFixture[] }).cases;

describe("parseTodoDate fixtures", () => {
  it("has at least 40 shared cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  for (const fixture of cases) {
    it(fixture.name, () => {
      const result = parseTodoDate(fixture.text, {
        now: new Date(fixture.now),
        timeZone: fixture.timeZone,
      });
      expect({
        title: result.title,
        dueDay: result.dueDay ? dueDayKey(result.dueDay) : null,
        matched: result.matched?.text ?? null,
      }).toEqual(fixture.expected);
    });
  }
});

describe("parseTodoDate", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("returns the due day in the stored form (midnight UTC)", () => {
    const result = parseTodoDate("Pay rent tomorrow", { now });
    expect(result.dueDay?.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("reports the matched span as offsets into the input", () => {
    const text = "Dinner with Sam on fri";
    const { matched } = parseTodoDate(text, { now });
    expect(matched).toEqual({ text: "on fri", start: 16, end: 22 });
    expect(text.slice(matched?.start, matched?.end)).toBe("on fri");
  });

  it("defaults to UTC when no time zone is given", () => {
    const late = new Date("2026-10-14T23:30:00Z");
    const { dueDay } = parseTodoDate("Pay rent today", { now: late });
    expect(dueDay && dueDayKey(dueDay)).toBe("2026-10-14");
  });
});
