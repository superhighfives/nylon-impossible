import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OVERNIGHT_DISMISSED_KEY,
  overnightNote,
  overnightText,
  readDismissedAt,
  writeDismissedAt,
} from "../overnight";

const TZ = "America/Los_Angeles";
// 00:00:30 on Tuesday 20 October in Los Angeles.
const SWEPT = "2026-10-20T07:00:30.000Z";
const sweep = (week: number, someday: number, at = SWEPT) => ({
  at,
  movedToThisWeek: week,
  movedToSomeday: someday,
});

describe("overnightText", () => {
  it("names each list that got something", () => {
    expect(overnightText(sweep(2, 0))).toBe("2 moved to This Week overnight");
    expect(overnightText(sweep(2, 1))).toBe(
      "2 moved to This Week, 1 to Someday overnight",
    );
    expect(overnightText(sweep(0, 1))).toBe("1 moved to Someday overnight");
  });

  it("is null when nothing moved", () => {
    expect(overnightText(sweep(0, 0))).toBeNull();
  });
});

describe("overnightNote", () => {
  const base = {
    sweep: sweep(2, 1),
    // Tuesday afternoon in Los Angeles.
    now: new Date("2026-10-20T21:00:00.000Z"),
    timeZone: TZ,
    dismissedAt: null,
    addedToTodaySince: () => false,
  };

  it("shows on the user's local day of the sweep", () => {
    expect(overnightNote(base)).toBe(
      "2 moved to This Week, 1 to Someday overnight",
    );
  });

  it("goes by the user's timezone, not UTC", () => {
    // 01:00 UTC Wednesday is still Tuesday evening in Los Angeles…
    expect(
      overnightNote({ ...base, now: new Date("2026-10-21T01:00:00.000Z") }),
    ).not.toBeNull();
    // …but already Wednesday in Tokyo, where that sweep was yesterday.
    expect(
      overnightNote({
        ...base,
        timeZone: "Asia/Tokyo",
        now: new Date("2026-10-21T01:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("is gone the next day", () => {
    expect(
      overnightNote({ ...base, now: new Date("2026-10-21T15:00:00.000Z") }),
    ).toBeNull();
  });

  it("is hidden once dismissed for that sweep, but not for the next", () => {
    expect(overnightNote({ ...base, dismissedAt: SWEPT })).toBeNull();
    expect(
      overnightNote({ ...base, dismissedAt: "2026-10-19T07:00:30.000Z" }),
    ).not.toBeNull();
  });

  it("goes away once anything is added to Today after the sweep", () => {
    const addedToTodaySince = vi.fn(() => true);
    expect(overnightNote({ ...base, addedToTodaySince })).toBeNull();
    expect(addedToTodaySince).toHaveBeenCalledWith(new Date(SWEPT));
  });

  it("needs a sweep that moved something", () => {
    expect(overnightNote({ ...base, sweep: null })).toBeNull();
    expect(overnightNote({ ...base, sweep: undefined })).toBeNull();
    expect(overnightNote({ ...base, sweep: sweep(0, 0) })).toBeNull();
    expect(overnightNote({ ...base, sweep: sweep(1, 0, "nope") })).toBeNull();
  });
});

describe("dismissal storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("round-trips the dismissed sweep's time", () => {
    writeDismissedAt(SWEPT);
    expect(window.localStorage.getItem(OVERNIGHT_DISMISSED_KEY)).toBe(SWEPT);
    expect(readDismissedAt()).toBe(SWEPT);
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeDismissedAt(SWEPT)).not.toThrow();
    expect(readDismissedAt()).toBeNull();
  });
});
