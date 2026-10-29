import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = {
  timezone: "America/Los_Angeles",
  lastSweep: {
    at: "2026-10-20T07:00:30.000Z",
    movedToThisWeek: 2,
    movedToSomeday: 0,
  } as {
    at: string;
    movedToThisWeek: number;
    movedToSomeday: number;
  } | null,
};
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: user }) }));
vi.mock("@/hooks/useHints", () => ({
  useHints: () => ({ timeZone: "UTC" }),
}));

import { OVERNIGHT_DISMISSED_KEY } from "@/lib/overnight";
import { OvernightPill, useOvernightNote } from "../OvernightNote";
import { makeTodo } from "./fixtures";

const TODAY = "list-today";

describe("useOvernightNote", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T18:00:00.000Z"));
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  const older = makeTodo({ listId: TODAY, createdAt: "2026-10-19T10:00:00Z" });

  it("shows the sweep's counts on the morning after", () => {
    const { result } = renderHook(() => useOvernightNote([older], TODAY));
    expect(result.current.text).toBe("2 moved to This week overnight");
  });

  it("dismisses for that sweep and remembers it", () => {
    const { result } = renderHook(() => useOvernightNote([older], TODAY));
    act(() => result.current.dismiss());
    expect(result.current.text).toBeNull();
    expect(window.localStorage.getItem(OVERNIGHT_DISMISSED_KEY)).toBe(
      "2026-10-20T07:00:30.000Z",
    );
    // A fresh mount reads the dismissal back.
    const again = renderHook(() => useOvernightNote([older], TODAY));
    expect(again.result.current.text).toBeNull();
  });

  it("stays dismissed for the session when storage throws", () => {
    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const { result } = renderHook(() => useOvernightNote([older], TODAY));
    act(() => result.current.dismiss());
    expect(result.current.text).toBeNull();
    set.mockRestore();
  });

  it("goes away once a todo is added to Today", () => {
    const { result, rerender } = renderHook(
      ({ todos }) => useOvernightNote(todos, TODAY),
      { initialProps: { todos: [older] } },
    );
    expect(result.current.text).not.toBeNull();
    const added = makeTodo({
      id: "todo-new",
      listId: TODAY,
      createdAt: "2026-10-20T17:30:00Z",
    });
    rerender({ todos: [older, added] });
    expect(result.current.text).toBeNull();
  });

  it("ignores todos added to other lists", () => {
    const elsewhere = makeTodo({
      id: "todo-week",
      listId: "list-week",
      createdAt: "2026-10-20T17:30:00Z",
    });
    const { result } = renderHook(() =>
      useOvernightNote([older, elsewhere], TODAY),
    );
    expect(result.current.text).not.toBeNull();
  });
});

describe("OvernightPill", () => {
  it("is a status with the text as a link and a labelled dismiss", async () => {
    const onSee = vi.fn();
    const onDismiss = vi.fn();
    render(
      <OvernightPill
        text="2 moved to This week overnight"
        onSee={onSee}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "2 moved to This week" }),
    );
    expect(onSee).toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss overnight note" }),
    );
    expect(onDismiss).toHaveBeenCalled();
  });
});
