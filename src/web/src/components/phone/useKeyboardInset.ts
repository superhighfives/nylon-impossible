import { useEffect, useState } from "react";

/**
 * How many CSS pixels of the layout viewport the on-screen keyboard covers,
 * from `visualViewport`. iOS Safari doesn't resize the layout viewport for the
 * keyboard, so a `position: fixed; bottom: 0` element ends up hidden behind
 * it; offsetting by this keeps the composer sitting on top of the keyboard.
 * 0 when there's no keyboard (or no `visualViewport`, e.g. in tests).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered = window.innerHeight - vv.height - vv.offsetTop;
        // Ignore sub-pixel noise and the URL bar collapsing (~a few px).
        setInset(covered > 40 ? Math.round(covered) : 0);
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
