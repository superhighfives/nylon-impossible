import { signAddonState } from "@nylon-impossible/shared/addon-state";
import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  buildConnectCard,
  type Card,
  renderCard,
  updateCard,
} from "../../lib/addon-cards";
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
    })
    .optional(),
});

export type AddonEvent = z.infer<typeof addonEventSchema>;

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
