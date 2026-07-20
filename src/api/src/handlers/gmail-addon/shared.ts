import { signAddonState } from "@nylon-impossible/shared/addon-state";
import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import {
  buildConnectCard,
  type Card,
  renderCard,
  updateCard,
} from "../../lib/addon-cards";
import type { Env, GoogleIdTokenClaims } from "../../types";

const DEFAULT_WEB_BASE_URL = "https://www.nylonimpossible.com";

/**
 * The Google Workspace add-on event object POSTed to our endpoints. Only the
 * fields we read are typed; everything is optional because triggers, actions,
 * and hosts populate different subsets.
 */
export interface AddonEvent {
  commonEventObject?: {
    hostApp?: string;
    formInputs?: Record<
      string,
      { stringInputs?: { value?: string[] } } | undefined
    >;
    parameters?: Record<string, string>;
  };
  gmail?: {
    messageId?: string;
    threadId?: string;
    // Present only in some token/scope configurations — see the identity spike
    // in the plan. Read defensively; the card falls back when it's absent.
    subject?: string;
  };
}

/** The origin (scheme + host) this request arrived on — the add-on's base URL. */
export function requestBaseUrl(c: Context<Env>): string {
  return new URL(c.req.url).origin;
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
 * Pull the message context for the contextual card. `messageId`/`threadId` come
 * from the event's `gmail` block; the thread permalink is derived from the
 * thread id. Subject carriage depends on the deployment's token config (the
 * plan's spike) — we read it if present and fall back otherwise. No Gmail API
 * call and no message body is read, keeping us on the metadata-only scope.
 */
export function extractMessageContext(event: AddonEvent): {
  subject: string;
  permalink: string | null;
} {
  const threadId = event.gmail?.threadId;
  const permalink = threadId
    ? `https://mail.google.com/mail/u/0/#all/${threadId}`
    : null;
  const subject = event.gmail?.subject?.trim() || "Follow up on email";
  return { subject, permalink };
}

/** Parse the POSTed event body, tolerating an empty/invalid body. */
export async function readAddonEvent(c: Context<Env>): Promise<AddonEvent> {
  try {
    return (await c.req.json()) as AddonEvent;
  } catch {
    return {};
  }
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
  const base = c.env.WEB_BASE_URL ?? DEFAULT_WEB_BASE_URL;
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
  return cardResponse(c, buildConnectCard(connectUrl), opts);
}
