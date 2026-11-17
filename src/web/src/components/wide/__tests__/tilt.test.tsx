import { DndContext } from "@dnd-kit/core";
import { render, renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTodo } from "@/components/phone/__tests__/fixtures";
import {
  landingSwing,
  pickTilt,
  swingKeyframes,
  type TiltTokens,
  tiltTokens,
} from "../tilt";
import { DragPreview, useBoardDrag } from "../useBoardDrag";

vi.mock("@/hooks/useHints", () => ({
  useHints: () => ({ reducedMotion: "no-preference" }),
}));

/** A seeded generator (mulberry32), so a run is repeatable. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKENS: TiltTokens = {
  max: 1.5,
  settleOvershoot: 0.4,
  settleMinTilt: 0.25,
};

/** tokens.css's tilt values, as the page has them. */
function loadTiltTokens() {
  const root = document.documentElement.style;
  root.setProperty("--n-tilt-max", "1.5deg");
  root.setProperty("--n-settle-overshoot", "0.4deg");
  root.setProperty("--n-settle-min-tilt", "0.25deg");
}

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("pickTilt", () => {
  it("always lands within ±tiltMax, both ways", () => {
    const random = seeded(694);
    const angles = Array.from({ length: 2000 }, () =>
      pickTilt(TOKENS.max, random),
    );
    for (const angle of angles) {
      expect(Math.abs(angle)).toBeLessThanOrEqual(TOKENS.max);
    }
    expect(Math.min(...angles)).toBeLessThan(-1.4);
    expect(Math.max(...angles)).toBeGreaterThan(1.4);
  });

  it("maps the ends of the random range to the ends of the tilt", () => {
    expect(pickTilt(1.5, () => 0)).toBe(-1.5);
    expect(pickTilt(1.5, () => 0.5)).toBe(0);
  });
});

describe("tiltTokens", () => {
  it("reads the tilt from tokens.css, or nothing without it", () => {
    expect(tiltTokens()).toBeNull();
    loadTiltTokens();
    expect(tiltTokens()).toEqual(TOKENS);
  });
});

describe("landingSwing", () => {
  it("swings past level the opposite way to the tilt", () => {
    expect(landingSwing(1.2, TOKENS, false)).toBe(-0.4);
    expect(landingSwing(-0.9, TOKENS, false)).toBe(0.4);
  });

  it("a nearly level drag lands with no swing", () => {
    expect(landingSwing(0.2, TOKENS, false)).toBe(0);
    expect(landingSwing(-0.24, TOKENS, false)).toBe(0);
  });

  it("reduced motion drops the swing", () => {
    expect(landingSwing(1.2, TOKENS, true)).toBe(0);
  });

  it("swings through the overshoot at 60%, on rotate", () => {
    expect(swingKeyframes(1.2, -0.4)).toEqual([
      { rotate: "1.2deg" },
      { rotate: "-0.4deg", offset: 0.6 },
      { rotate: "0deg" },
    ]);
  });
});

describe("DragPreview", () => {
  it("tilts the card by the drag's angle, lifted", () => {
    render(<DragPreview todo={makeTodo()} tilt={0.8} />);
    const preview = document.querySelector<HTMLElement>("[data-drag-preview]");
    expect(preview).toHaveClass("n-lifted");
    expect(preview?.style.getPropertyValue("--n-drag-tilt")).toBe("0.8deg");
  });
});

describe("useBoardDrag", () => {
  it("picks one angle as the todo lifts and holds it while it moves", () => {
    loadTiltTokens();
    const random = vi.spyOn(Math, "random");
    random.mockReturnValueOnce(0.9);
    const todo = makeTodo();
    const { result } = renderHook(
      () =>
        useBoardDrag({
          rowsFor: () => [todo],
          actions: { move: vi.fn(), place: vi.fn() },
          onStart: vi.fn(),
        }),
      { wrapper: ({ children }) => <DndContext>{children}</DndContext> },
    );
    const start = {
      active: { id: todo.id, data: { current: { todo } } },
      activatorEvent: new MouseEvent("pointerdown"),
    };
    act(() =>
      result.current.handlers.onDragStart(
        start as unknown as Parameters<
          typeof result.current.handlers.onDragStart
        >[0],
      ),
    );
    const tilt = result.current.tilt;
    expect(tilt).toBeCloseTo((0.9 * 2 - 1) * 1.5);
    random.mockReturnValue(0.1);
    for (const y of [10, 20, 30]) {
      act(() =>
        result.current.handlers.onDragMove({
          ...start,
          over: null,
          delta: { x: 0, y },
        } as unknown as Parameters<
          typeof result.current.handlers.onDragMove
        >[0]),
      );
    }
    expect(result.current.tilt).toBe(tilt);
    act(() => result.current.handlers.onDragCancel());
    random.mockRestore();
  });
});
