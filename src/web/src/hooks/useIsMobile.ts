import { useEffect, useState } from "react";

/** Tailwind's `sm` breakpoint — below this we treat the layout as mobile. */
const MOBILE_MAX_WIDTH = 640;

/**
 * Whether the viewport is below the `sm` breakpoint. Defaults to `false`
 * (desktop) until mounted, so it's safe for SSR/first paint; components that
 * only diverge on mobile settle to the right value after hydration.
 */
export function useIsMobile(maxWidth: number = MOBILE_MAX_WIDTH): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [maxWidth]);

  return isMobile;
}
