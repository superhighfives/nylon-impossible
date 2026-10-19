/**
 * Automatic timezone: every client reports the device's IANA zone so the
 * aging sweep's "local midnight" follows the user around. A zone picked by hand
 * in Settings turns `timezoneAuto` off, and clients then leave it alone.
 */

/** Whether `zone` is an IANA identifier this runtime can format with. */
export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The PATCH body a client should send to bring the stored zone in line with
 * the device, or null when there's nothing to do: automatic is off, the zones
 * already match, or the device zone is unusable.
 */
export function automaticTimezoneUpdate(
  user: { timezone: string; timezoneAuto?: boolean | null },
  deviceZone: string | null | undefined,
): { timezone: string } | null {
  // A server that predates `timezoneAuto` omits it; treat that as automatic.
  if (user.timezoneAuto === false) return null;
  if (!deviceZone || !isValidTimeZone(deviceZone)) return null;
  if (deviceZone === user.timezone) return null;
  return { timezone: deviceZone };
}
