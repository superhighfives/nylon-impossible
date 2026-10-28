import { useCallback, useEffect, useRef, useState } from "react";

/** How long the G hint waits for the next key. */
const GO_HINT_MS = 1200;

/**
 * G, then a letter: whether a G is waiting for its letter, and whether the
 * hint card shows. It ends on the next key or after 1.2 seconds.
 */
export function useGoSequence() {
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hint, setHint] = useState(false);

  const end = useCallback(() => {
    pending.current = false;
    if (timer.current) clearTimeout(timer.current);
    setHint(false);
  }, []);

  const start = useCallback(() => {
    pending.current = true;
    setHint(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(end, GO_HINT_MS);
  }, [end]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** True when a G was waiting, which this key now consumes. */
  const take = useCallback(() => {
    const was = pending.current;
    if (was) end();
    return was;
  }, [end]);

  return { hint, start, take };
}
