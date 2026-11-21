/** Base64url without padding (RFC 4648 §5): tokens, tickets and cursors. */
export function base64url(bytes: Uint8Array): string {
  // A loop rather than String.fromCharCode(...bytes), whose spread hits the
  // argument limit on long input.
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
