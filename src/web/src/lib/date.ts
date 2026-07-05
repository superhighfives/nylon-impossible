/**
 * Formats a date in the user's time zone (from the time-zone client hint) so the
 * calendar day is correct regardless of where the code runs — SSR on Cloudflare
 * runs in UTC, which can render the wrong day near midnight. Pass `timeZone`
 * from `useHints()`.
 */
export function formatDate(
  date: Date | string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { timeZone, ...options });
}
