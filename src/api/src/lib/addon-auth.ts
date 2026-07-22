import * as Sentry from "@sentry/cloudflare";
import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { Env, GoogleIdTokenClaims } from "../types";
import { clerkClient } from "./clerk";
import { eq, type getDb, gmailAddonLinks, users } from "./db";
import { apiError } from "./errors";

// Google's public signing keys. `createRemoteJWKSet` fetches and caches them
// (with its own cooldown/refresh), so verification doesn't hit the network on
// every request within an isolate.
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

// Google mints ID tokens with either issuer spelling.
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let cachedJwks: JWTVerifyGetKey | undefined;
function googleJwks(): JWTVerifyGetKey {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return cachedJwks;
}

/**
 * Test-only seam: override the key resolver used by `verifyGoogleToken` so the
 * `/gmail-addon/*` routes can be exercised end-to-end against tokens signed by a
 * local keypair, without reaching Google's network JWKS. Never called in
 * production. Pass `undefined` to restore the remote set.
 */
export function __setGoogleJwksForTest(
  resolver: JWTVerifyGetKey | undefined,
): void {
  cachedJwks = resolver;
}

/**
 * Verify a Google-signed ID token: RS256 signature against Google's JWKS,
 * issuer is Google, and audience matches our configured add-on endpoint. Any
 * failure (bad signature, wrong audience, expired — jose checks `exp`) resolves
 * to null so callers uniformly reject.
 *
 * `keyResolver` defaults to Google's remote JWKS; tests pass a local key to
 * verify tokens signed by a generated keypair without hitting the network.
 */
export async function verifyGoogleToken(
  token: string,
  audience: string | string[],
  keyResolver: JWTVerifyGetKey | CryptoKey | Uint8Array = googleJwks(),
): Promise<GoogleIdTokenClaims | null> {
  try {
    // jose's jwtVerify branches at runtime on whether the second arg is a key
    // or a getKey function; the cast just picks one overload for the compiler.
    const { payload } = await jwtVerify(token, keyResolver as JWTVerifyGetKey, {
      issuer: GOOGLE_ISSUERS,
      audience,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    return payload as GoogleIdTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Middleware guarding the `/gmail-addon/*` routes. Mirrors the Clerk-webhook
 * pattern: this is a distinct auth from `authMiddleware` — the Google-signed ID
 * token *is* the credential. On success the verified claims are stashed on the
 * context for `resolveNylonUser`; handlers, not this middleware, decide whether
 * an unlinked Google identity gets a "Connect Nylon" card (a 200 with a card),
 * so the only thing rejected here is a request that isn't genuinely from Google.
 */
export const verifyGoogleIdToken = createMiddleware<Env>(async (c, next) => {
  // Accept a comma-separated allow-list so the deployment can send either a
  // single configured audience or a per-endpoint one without a code change —
  // exactly the axis the plan's identity spike leaves open.
  const audiences =
    c.env.GMAIL_ADDON_AUDIENCE?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  // Fail closed: without a configured audience any Google-minted token would be
  // accepted, defeating the replay protection the `aud` check provides.
  if (audiences.length === 0) {
    Sentry.captureMessage("GMAIL_ADDON_AUDIENCE is not configured", "error");
    return apiError(c, "unauthorized");
  }

  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return apiError(c, "unauthorized");
  }

  const claims = await verifyGoogleToken(header.slice(7), audiences);
  if (!claims) {
    return apiError(c, "unauthorized");
  }

  c.set("googleClaims", claims);
  await next();
});

/** Outcome of mapping a Google identity to a Nylon account. */
export type ResolveNylonUserResult =
  | { status: "linked"; userId: string }
  | { status: "unlinked"; googleSub: string; email: string | null };

/**
 * Map a verified Google identity to a Nylon Clerk user, in three steps:
 *   1. Existing link — `gmail_addon_links` keyed by the Google `sub`.
 *   2. Email fast-path auto-link — find a Clerk user whose Google OAuth
 *      connection matches this verified identity (by provider user id, falling
 *      back to email), record the link, and proceed. Covers the common
 *      "signed up with the same Google account" case with zero friction.
 *   3. No match — return `unlinked` so the caller can show a connect card.
 */
export async function resolveNylonUser(
  db: ReturnType<typeof getDb>,
  env: Env["Bindings"],
  claims: GoogleIdTokenClaims,
): Promise<ResolveNylonUserResult> {
  const googleSub = claims.sub;
  const email = claims.email ?? null;

  // 1. Existing link.
  const [existing] = await db
    .select({ clerkUserId: gmailAddonLinks.clerkUserId })
    .from(gmailAddonLinks)
    .where(eq(gmailAddonLinks.googleSub, googleSub))
    .limit(1);
  if (existing) {
    return { status: "linked", userId: existing.clerkUserId };
  }

  // 2. Email fast-path. Only attempt when Google explicitly asserts a verified
  // email — absence is not trust, since this gates binding a Gmail identity to
  // an existing Nylon account. An unverified/absent claim falls through to the
  // connect card.
  if (email && claims.email_verified === true) {
    const clerkUserId = await findClerkUserByGoogleIdentity(
      env,
      googleSub,
      email,
    );
    if (clerkUserId) {
      // Confirm the Nylon account exists locally before recording the link —
      // the FK requires a users row, and webhooks create it on sign-up.
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, clerkUserId))
        .limit(1);
      if (user) {
        await db
          .insert(gmailAddonLinks)
          .values({ googleSub, clerkUserId, email })
          .onConflictDoNothing();
        return { status: "linked", userId: clerkUserId };
      }
    }
  }

  // 3. No match.
  return { status: "unlinked", googleSub, email };
}

/**
 * Ask Clerk for a user whose Google OAuth connection matches this identity.
 * Prefers an exact Google provider-user-id match (the strongest signal), then
 * falls back to a verified email match on a Google external account.
 */
async function findClerkUserByGoogleIdentity(
  env: Env["Bindings"],
  googleSub: string,
  email: string,
): Promise<string | null> {
  let candidates: Awaited<
    ReturnType<ReturnType<typeof clerkClient>["users"]["getUserList"]>
  >["data"];
  try {
    const response = await clerkClient(env).users.getUserList({
      emailAddress: [email],
    });
    candidates = response.data;
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "gmail-addon-auth" } });
    return null;
  }

  const isGoogle = (provider: string) =>
    provider.toLowerCase().includes("google");
  const normalizedEmail = email.toLowerCase();

  // Strongest: a Google external account whose provider user id is this sub.
  for (const user of candidates) {
    const match = user.externalAccounts.find(
      (account) =>
        isGoogle(account.provider) && account.providerUserId === googleSub,
    );
    if (match) return user.id;
  }

  // Fallback: a Google external account carrying this verified email.
  for (const user of candidates) {
    const match = user.externalAccounts.find(
      (account) =>
        isGoogle(account.provider) &&
        account.emailAddress?.toLowerCase() === normalizedEmail,
    );
    if (match) return user.id;
  }

  return null;
}
