import { useCallback, useEffect, useRef, useState } from "react";

/** How long typing pauses before an edit is saved. */
export const AUTOSAVE_MS = 400;

/**
 * A text field that saves itself: typing updates local state immediately and
 * commits after a short pause, on blur, and on unmount — there's no Save
 * button anywhere. While the field isn't being edited it follows `remote`, so
 * a change synced from another device shows up.
 */
export function useAutosaveField(
  remote: string,
  commit: (value: string) => void,
) {
  const [value, setValue] = useState(remote);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ value, commit });
  latest.current = { value, commit };

  useEffect(() => {
    if (!dirty.current) setValue(remote);
  }, [remote]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    latest.current.commit(latest.current.value);
  }, []);

  useEffect(() => flush, [flush]);

  const onChange = useCallback(
    (next: string) => {
      dirty.current = true;
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_MS);
    },
    [flush],
  );

  return { value, onChange, flush };
}
