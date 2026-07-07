import { useEffect, useState } from "react";

/**
 * Forces a re-render at the next local midnight (and every midnight after),
 * so time-derived UI — like a repeating todo that should drop out of the
 * Completed section once its `completedAt` is no longer "today" — updates on
 * its own without a refetch or user interaction. Client-only (schedules a
 * timeout in an effect); no-op during SSR.
 */
export function useLocalMidnightTick(): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      // setHours(24, …) rolls to 00:00 of the following day in local time.
      nextMidnight.setHours(24, 0, 0, 0);
      // +1s cushion so the timer fires just after the boundary, never a hair
      // before it (which would leave the old day still "today").
      const delay = nextMidnight.getTime() - now.getTime() + 1000;
      timer = setTimeout(() => {
        setTick((t) => t + 1);
        schedule();
      }, delay);
    };

    schedule();
    return () => clearTimeout(timer);
  }, []);
}
