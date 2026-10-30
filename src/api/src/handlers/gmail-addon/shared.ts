import { signAddonState } from "@nylon-impossible/shared/addon-state";
import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  ADDON_ACTIONS,
  type AddonMessage,
  buildConnectCard,
  type Card,
  renderCard,
  updateCard,
} from "../../lib/addon-cards";
import { fetchMessageMetadata } from "../../lib/gmail-message";
import type { Env, GoogleIdTokenClaims } from "../../types";

const DEFAULT_WEB_BASE_URL = "https://www.nylonimpossible.com";

/** Longest todo text accepted from a card, matching `smartCreateSchema`. */
export const MAX_ADDON_TODO_TEXT = 10000;

/**
 * Schema for the Google Workspace add-on event object POSTed to our endpoints.
 * We validate rather than cast: the bearer token proves the *caller* is Google,
 * but not that the *body* matches this shape (and the exact shape is still being
 * pinned against a live deployment — see the plan's identity spike). Every field
 * is optional because triggers, actions, and hosts populate different subsets.
 *
 * `value` is normalized to a string array — Google sends `string[]`, but a bare
 * string is tolerated so `value[0]` can never silently index into a character.
 */
const stringInputsSchema = z.object({
  value: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
});

const addonEventSchema = z.object({
  commonEventObject: z
    .object({
      hostApp: z.string().optional(),
      formInputs: z
        .record(
          z.string(),
          z.object({ stringInputs: stringInputsSchema.optional() }),
        )
        .optional(),
      parameters: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  gmail: z
    .object({
      messageId: z.string().optional(),
      threadId: z.string().optional(),
      // Present only in some token/scope configurations — see the identity
      // spike in the plan. Read defensively; the card falls back if absent.
      subject: z.string().optional(),
      // A short-lived token for just the open message, for the Gmail API.
      accessToken: z.string().optional(),
    })
    .optional(),
  // The user's OAuth token, sent alongside `gmail.accessToken` so the add-on
  // can read the open message's headers. Google's docs spell it both ways.
  authorizationEventObject: z
    .object({
      userOAuthToken: z.string().optional(),
      userOauthToken: z.string().optional(),
    })
    .optional(),
});

export type AddonEvent = z.infer<typeof addonEventSchema>;

/** The origin (scheme + host) this request arrived on — the add-on's base URL. */
export function requestBaseUrl(c: Context<Env>): string {
  return new URL(c.req.url).origin;
}

/** The web app's base URL, for "Open Nylon" links and the connect flow. */
export function webBaseUrl(c: Context<Env>): string {
  return c.env.WEB_BASE_URL ?? DEFAULT_WEB_BASE_URL;
}

/** Read a form text input value from the event, trimmed. */
export function readFormInput(
  event: AddonEvent,
  name: string,
): string | undefined {
  const value =
    event.commonEventObject?.formInputs?.[name]?.stringInputs?.value?.[0];
  return value?.trim() || undefined;
}

/** Read an action parameter value from the event. */
export function readParameter(
  event: AddonEvent,
  key: string,
): string | undefined {
  return event.commonEventObject?.parameters?.[key];
}

/**
 * The message context the event itself carries: the thread permalink, derived
 * from the thread id, and a subject if the deployment's token config put one
 * there (in practice it doesn't; `loadMessageContext` reads it from Gmail).
 */
export function extractMessageContext(event: AddonEvent): AddonMessage {
  const threadId = event.gmail?.threadId;
  const permalink = threadId
    ? `https://mail.google.com/mail/u/0/#all/${threadId}`
    : null;
  return { subject: event.gmail?.subject?.trim() || null, permalink };
}

/** "Oct 28", in the user's timezone: when the open email was sent. */
export function formatSentDate(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

/**
 * The open message for the contextual card: the event's context, filled in
 * with the subject, sender and date read from the Gmail API with the event's
 * tokens. Headers only, inside the metadata scope; if the call can't be made
 * or fails, the card shows what the event had.
 */
export async function loadMessageContext(
  event: AddonEvent,
  timeZone: string,
): Promise<AddonMessage> {
  const message = extractMessageContext(event);
  const messageId = event.gmail?.messageId;
  const messageToken = event.gmail?.accessToken;
  const auth = event.authorizationEventObject;
  const userToken = auth?.userOAuthToken ?? auth?.userOauthToken;
  if (!messageId || !messageToken || !userToken) return message;
  const metadata = await fetchMessageMetadata({
    messageId,
    messageToken,
    userToken,
  });
  if (!metadata) return message;
  return {
    ...message,
    subject: metadata.subject ?? message.subject,
    from: metadata.from,
    date: metadata.date ? formatSentDate(metadata.date, timeZone) : null,
  };
}

/**
 * The message an action on the contextual card was about. Gmail sends the
 * open message's ids with every event, so the permalink is rebuilt from the
 * thread when it can be; the subject, sender and date (and, failing that, the
 * permalink) come back as the card's own action parameters, rather than
 * reading Gmail again. A permalink from parameters is
 * caller input, so only a Gmail URL is kept.
 */
export function messageFromAction(event: AddonEvent): AddonMessage {
  const fromEvent = extractMessageContext(event);
  const subject = readParameter(event, "subject")?.trim();
  const param = readParameter(event, "permalink");
  const permalink =
    fromEvent.permalink ??
    (param?.startsWith("https://mail.google.com/") ? param : null);
  return {
    subject: subject || fromEvent.subject,
    permalink,
    from: readParameter(event, "from")?.trim() || null,
    date: readParameter(event, "date")?.trim() || null,
  };
}

/**
 * Parse and validate the POSTed event body against `addonEventSchema`. A
 * missing, non-JSON, or schema-mismatched body yields an empty event, so
 * handlers fall back to their empty-state card instead of trusting raw input.
 */
export async function readAddonEvent(c: Context<Env>): Promise<AddonEvent> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {};
  }
  const parsed = addonEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/**
 * Build the connect-flow URL for the "Connect Nylon" card: the web route, with a
 * signed state carrying the Google identity so the web side can trust it. If the
 * state secret isn't configured we still return a usable URL without state (the
 * web route will ask the user to reopen the panel), and report it.
 */
export async function buildConnectUrl(
  c: Context<Env>,
  claims: GoogleIdTokenClaims,
): Promise<string> {
  const base = webBaseUrl(c);
  const secret = c.env.GMAIL_ADDON_STATE_SECRET;
  if (!secret) {
    Sentry.captureMessage(
      "GMAIL_ADDON_STATE_SECRET is not configured",
      "error",
    );
    return `${base}/connect/gmail-addon`;
  }
  const state = await signAddonState(secret, {
    googleSub: claims.sub,
    email: claims.email ?? null,
  });
  return `${base}/connect/gmail-addon?state=${encodeURIComponent(state)}`;
}

/**
 * Wrap a card in the right envelope for the surface: triggers push a fresh card,
 * action callbacks update the current one (optionally with a toast).
 */
export function cardResponse(
  c: Context<Env>,
  card: Card,
  opts: { asAction?: boolean; notification?: string } = {},
) {
  return c.json(
    opts.asAction ? updateCard(card, opts.notification) : renderCard(card),
  );
}

/** The connect card wrapped for the current surface. */
export async function connectResponse(
  c: Context<Env>,
  claims: GoogleIdTokenClaims,
  opts: { asAction?: boolean } = {},
) {
  const connectUrl = await buildConnectUrl(c, claims);
  const refreshUrl = `${requestBaseUrl(c)}${ADDON_ACTIONS.refresh}`;
  return cardResponse(c, buildConnectCard(connectUrl, refreshUrl), opts);
}
