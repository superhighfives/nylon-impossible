/**
 * The open message's subject, sender and date, for the Gmail add-on's
 * contextual card. Gmail doesn't put them in the event: the add-on reads them
 * from the Gmail API with two tokens the event does carry, the user's OAuth
 * token and a short-lived token for just this message. That stays inside the
 * `gmail.addons.current.message.metadata` scope (headers only, never the
 * body). See https://developers.google.com/workspace/add-ons/guides/alternate-runtimes.
 *
 * Best-effort: any failure (a missing token, a slow or failed call) returns
 * null and the card falls back to its placeholder, so the panel never waits
 * on Gmail for long or breaks because of it.
 */

import * as Sentry from "@sentry/cloudflare";

export interface MessageMetadata {
  subject: string | null;
  /** The sender's name, or their address when there's no name. */
  from: string | null;
  date: Date | null;
}

/** How long the card waits on Gmail before showing the placeholder. */
export const GMAIL_METADATA_TIMEOUT_MS = 2500;

/** "Sam Lee <sam@example.com>" → "Sam Lee"; a bare address stays as is. */
export function senderName(from: string): string | null {
  const trimmed = from.trim();
  const named = /^"?([^"<]*?)"?\s*<[^>]+>$/.exec(trimmed);
  const name = named?.[1]?.trim();
  if (name) return name;
  const address = /<([^>]+)>/.exec(trimmed)?.[1] ?? trimmed;
  return address || null;
}

export async function fetchMessageMetadata(input: {
  messageId: string;
  /** `gmail.accessToken`: this message only, short-lived. */
  messageToken: string;
  /** `authorizationEventObject.userOAuthToken`. */
  userToken: string;
}): Promise<MessageMetadata | null> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}`,
  );
  url.searchParams.set("format", "metadata");
  for (const header of ["Subject", "From", "Date"]) {
    url.searchParams.append("metadataHeaders", header);
  }
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${input.userToken}`,
        "X-Goog-Gmail-Access-Token": input.messageToken,
      },
      signal: AbortSignal.timeout(GMAIL_METADATA_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Gmail's own reason ("accessNotConfigured", "insufficientPermissions"),
      // so a fallback in the panel can be traced in the Worker's logs. Never
      // the tokens or the message's headers.
      const error = (await res.json().catch(() => null)) as {
        error?: { status?: string; errors?: { reason?: string }[] };
      } | null;
      console.log(
        JSON.stringify({
          gmailMetadata: res.status,
          reason: error?.error?.errors?.[0]?.reason ?? error?.error?.status,
        }),
      );
      Sentry.addBreadcrumb({
        category: "gmail-addon",
        message: `message metadata: ${res.status}`,
        level: "warning",
      });
      return null;
    }
    const body = (await res.json()) as {
      internalDate?: string;
      payload?: { headers?: { name?: string; value?: string }[] };
    };
    const header = (name: string) =>
      body.payload?.headers
        ?.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value?.trim() || null;
    const from = header("From");
    const sent = Number(body.internalDate);
    const date = Number.isFinite(sent) && sent > 0 ? new Date(sent) : null;
    return {
      subject: header("Subject"),
      from: from ? senderName(from) : null,
      date,
    };
  } catch (err) {
    console.log(
      JSON.stringify({
        gmailMetadata: err instanceof Error ? err.name : "error",
      }),
    );
    Sentry.addBreadcrumb({
      category: "gmail-addon",
      message: `message metadata failed: ${err instanceof Error ? err.name : "error"}`,
      level: "warning",
    });
    return null;
  }
}
