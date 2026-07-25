/**
 * Signed state passed through the Gmail add-on connect flow.
 *
 * The API mints this state when it shows a "Connect Nylon" card and embeds it in
 * the connect URL. The web connect route verifies it before recording the link.
 * The signature is what lets the web route trust the Google identity (`sub`) in
 * the state: without it, an attacker could craft a connect URL binding their own
 * Gmail identity to a victim's Nylon account. HMAC-SHA256 over the payload with
 * a secret shared by the two workers (`GMAIL_ADDON_STATE_SECRET`).
 *
 * Uses only Web Crypto (`crypto.subtle`) and base64url, both available in the
 * API Worker and the web Worker runtime, so the same code signs and verifies.
 */

export interface AddonStatePayload {
  /** Google `sub` of the end user connecting from Gmail. */
  googleSub: string;
  /** Verified Google email, for recording on the link row. */
  email: string | null;
  /** Expiry as epoch seconds. */
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Constant-time comparison of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Sign a state payload. Default TTL is 10 minutes — long enough to complete the
 * connect flow, short enough that a leaked URL isn't reusable for long. Pass
 * `nowSeconds` explicitly in tests (avoids Date.now nondeterminism).
 */
export async function signAddonState(
  secret: string,
  payload: Omit<AddonStatePayload, "exp">,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  ttlSeconds = 600,
): Promise<string> {
  const full: AddonStatePayload = { ...payload, exp: nowSeconds + ttlSeconds };
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(full)),
  );
  const key = await hmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return `${body}.${base64UrlEncode(signature)}`;
}

/**
 * Verify and decode a state token. Returns the payload, or null on any failure
 * (bad format, bad signature, or expired).
 */
export async function verifyAddonState(
  secret: string,
  token: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<AddonStatePayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  let expected: Uint8Array;
  try {
    const key = await hmacKey(secret);
    expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    );
  } catch {
    return null;
  }

  let provided: Uint8Array;
  try {
    provided = base64UrlDecode(sig);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, provided)) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as AddonStatePayload;
    if (typeof payload.exp !== "number" || payload.exp < nowSeconds) {
      return null;
    }
    if (typeof payload.googleSub !== "string" || !payload.googleSub) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
