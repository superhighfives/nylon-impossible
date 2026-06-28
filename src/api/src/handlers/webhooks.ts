import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { deleteUserCascade } from "../lib/delete-user";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Svix webhook signature. Svix signs `${id}.${timestamp}.${body}` with
 * the base64-decoded portion of `whsec_<base64>` as the HMAC-SHA256 key. The
 * `svix-signature` header carries one or more `v1,<base64>` entries separated
 * by spaces — any one matching is sufficient.
 *
 * Implemented inline (rather than pulling in the `svix` SDK) so we keep deps
 * lean and the verification is auditable in one place.
 */
async function verifySvixSignature(
  body: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
): Promise<boolean> {
  const secretBody = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(secretBody), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  const timestampSec = Number(headers.timestamp);
  if (!Number.isFinite(timestampSec)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > TOLERANCE_SECONDS) return false;

  const signedPayload = `${headers.id}.${headers.timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const expected = new Uint8Array(mac);

  return headers.signature
    .split(" ")
    .map((part) => part.trim())
    .some((part) => {
      const [version, value] = part.split(",", 2);
      if (version !== "v1" || !value) return false;
      let provided: Uint8Array;
      try {
        provided = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
      } catch {
        return false;
      }
      return constantTimeEqual(provided, expected);
    });
}

/**
 * Length-independent constant-time byte comparison. Always loops over the
 * longer input so the timing doesn't leak which side is shorter, then folds in
 * the length mismatch via OR so equal-length-but-different inputs and
 * different-length inputs both return false without short-circuiting.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

// POST /webhooks/clerk
export async function clerkWebhook(c: Context<Env>) {
  const secret = c.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage("CLERK_WEBHOOK_SECRET not configured", "warning");
    return apiError(c, "forbidden");
  }

  const id = c.req.header("svix-id");
  const timestamp = c.req.header("svix-timestamp");
  const signature = c.req.header("svix-signature");
  if (!id || !timestamp || !signature) {
    return apiError(c, "invalid_signature");
  }

  const body = await c.req.text();
  const valid = await verifySvixSignature(
    body,
    { id, timestamp, signature },
    secret,
  );
  if (!valid) return apiError(c, "invalid_signature");

  let payload: { type?: string; data?: { id?: string } };
  try {
    payload = JSON.parse(body);
  } catch {
    return apiError(c, "invalid_json");
  }

  if (payload.type === "user.deleted" && payload.data?.id) {
    await deleteUserCascade(c.env, payload.data.id, { deleteClerk: false });
  }

  // Other event types: acknowledge without action.
  return c.json({ received: true });
}
