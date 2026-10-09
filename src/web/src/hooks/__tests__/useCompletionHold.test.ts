import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPLETION_HOLD_MS, useCompletionHold } from "../useCompletionHold";

describe("useCompletionHold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("marks the id as completing and commits after the hold", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionHold());

    act(() => result.current.start("a", commit));
    expect(result.current.ids.has("a")).toBe(true);
    expect(commit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(result.current.ids.has("a")).toBe(false);
  });

  it("cancels a pending completion without committing", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionHold());

    act(() => result.current.start("a", commit));
    let cancelled = false;
    act(() => {
      cancelled = result.current.cancel("a");
    });
    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS));

    expect(cancelled).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    expect(result.current.ids.has("a")).toBe(false);
  });

  it("reports nothing to cancel for an id that isn't held", () => {
    const { result } = renderHook(() => useCompletionHold());
    expect(result.current.cancel("nope")).toBe(false);
  });

  it("flushes pending completions on unmount instead of dropping them", () => {
    const commit = vi.fn();
    const { result, unmount } = renderHook(() => useCompletionHold());

    act(() => result.current.start("a", commit));
    unmount();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
