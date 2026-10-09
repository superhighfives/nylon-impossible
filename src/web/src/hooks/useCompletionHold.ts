import { useCallback, useEffect, useRef, useState } from "react";

/** How long a just-checked row stays put before it moves to Completed. */
export const COMPLETION_HOLD_MS = 350;

/**
 * Delays committing a completion briefly so the check and strike-through
 * register before the row leaves its list — without it the row vanishes the
 * moment it's clicked and there's no sense of having done anything.
 *
 * `start` schedules the commit and marks the id as completing; `cancel` undoes
 * a pending one (a second press during the hold) and reports whether there was
 * anything to cancel. Pending commits are flushed on unmount rather than
 * dropped. Under reduced motion the commit happens immediately.
 */
export function useCompletionHold(delay = COMPLETION_HOLD_MS) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(
    new Map<
      string,
      { timer: ReturnType<typeof setTimeout>; commit: () => void }
    >(),
  );

  useEffect(() => {
    const scheduled = pending.current;
    return () => {
      for (const { timer, commit } of scheduled.values()) {
        clearTimeout(timer);
        commit();
      }
      scheduled.clear();
    };
  }, []);

  const remove = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const start = useCallback(
    (id: string, commit: () => void) => {
      if (
        typeof document !== "undefined" &&
        document.documentElement.dataset.reducedMotion === "reduce"
      ) {
        commit();
        return;
      }
      const timer = setTimeout(() => {
        pending.current.delete(id);
        commit();
        remove(id);
      }, delay);
      pending.current.set(id, { timer, commit });
      setIds((prev) => new Set(prev).add(id));
    },
    [delay, remove],
  );

  const cancel = useCallback(
    (id: string) => {
      const scheduled = pending.current.get(id);
      if (!scheduled) return false;
      clearTimeout(scheduled.timer);
      pending.current.delete(id);
      remove(id);
      return true;
    },
    [remove],
  );

  return { ids, start, cancel };
}
