import { automaticTimezoneUpdate } from "@nylon-impossible/shared";
import { useEffect, useRef } from "react";
import { useUpdateUser, useUser } from "@/hooks/useUser";

/** The browser's IANA zone, or null where `Intl` can't say. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Keeps the account's timezone in step with this browser while it's set to
 * Automatic. Silent: no toast on success or failure, since the next load tries
 * again. A zone picked by hand (`timezoneAuto: false`) is never overwritten.
 * Rendered once, app-wide, next to ThemeSync.
 */
export function TimezoneSync() {
  const { data: user } = useUser();
  const { mutate } = useUpdateUser();
  // One attempt per stored/detected pair, so a failing PATCH can't loop.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const update = automaticTimezoneUpdate(user, browserTimeZone());
    if (!update) return;
    const key = `${user.timezone}→${update.timezone}`;
    if (attempted.current === key) return;
    attempted.current = key;
    mutate(update);
  }, [user, mutate]);

  return null;
}
