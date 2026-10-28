/**
 * A link typed or pasted into a todo's "Paste a link" field, as the `http:`
 * or `https:` URL to store, or null when it doesn't look like a link. Adds
 * `https://` when there's no scheme ("localhost:3000" is a host and port, not
 * a scheme). Rejects a link carrying a username or password, the shape of
 * "https://google.com@evil.example". Shared so the field can say "That
 * doesn't look like a link." before the API would.
 */
export function normalizeLink(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:(?!\d)/i.test(text)
    ? text
    : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  // A host with a dot (example.com), or localhost: "hello" isn't a link.
  const host = url.hostname;
  if (host !== "localhost" && !/^[^.]+(\.[^.]+)+$/.test(host)) return null;
  return url.href;
}
