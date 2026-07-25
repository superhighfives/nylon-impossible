/**
 * Email URL detection.
 *
 * Identifies links that point at a webmail thread (currently Gmail) so we can
 * render them as an email — the message subject as the label with a mail icon —
 * rather than a bare hostname. Populated by the Gmail add-on, which attaches the
 * thread permalink with the subject as its title.
 */

export type EmailProvider = "gmail";

export interface EmailUrlInfo {
  provider: EmailProvider;
  /** Hostname of the parsed URL, reused to avoid double-parsing in components. */
  hostname: string;
}

const GMAIL_HOSTS = new Set(["mail.google.com"]);

/**
 * Detect whether a URL points at a webmail thread. Returns null if it's not a
 * recognized email link.
 */
export function getEmailUrlInfo(urlString: string): EmailUrlInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (GMAIL_HOSTS.has(host)) {
    return { provider: "gmail", hostname: host };
  }

  return null;
}
