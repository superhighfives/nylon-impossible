import { useSyncExternalStore } from "react";

/**
 * The wide layout's breakpoint (Tailwind `lg`). Below it the web app uses the
 * phone layout; at and above it, the board.
 */
export const WIDE_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia(WIDE_QUERY).matches;
}

/**
 * Whether the viewport is wide, or `null` when it can't be known yet — on the
 * server and during hydration. Callers render both layouts while it's null and
 * let CSS (`lg:`) show the right one, so the first paint is correct with no
 * flash; once it resolves, the hidden layout is unmounted.
 */
export function useIsWide(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
