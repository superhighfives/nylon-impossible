import type { ReactNode } from "react";
import { useIsWide } from "@/hooks/useIsWide";

/**
 * Picks the phone layout below 1024px and the board at and above it, without
 * a flash on SSR: the server (and the hydrating client) render both inside
 * CSS-switched wrappers, so the browser paints the right one straight away;
 * after hydration the one that doesn't match is unmounted, and a resize
 * across the breakpoint swaps them.
 */
export function LayoutSwitch({
  phone,
  wide,
}: {
  phone: ReactNode;
  wide: ReactNode;
}) {
  const isWide = useIsWide();
  return (
    <>
      <div data-layout="phone" className="contents lg:hidden">
        {isWide !== true && phone}
      </div>
      <div data-layout="wide" className="hidden lg:contents">
        {isWide !== false && wide}
      </div>
    </>
  );
}
