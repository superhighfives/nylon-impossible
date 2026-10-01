import { getSocialUrlInfo, parseSocialAuthor } from "@/lib/social-urls";
import type { SerializedTodoUrl } from "@/types/database";

export interface UrlDisplay {
  /** Parsed hostname, or null if the URL is malformed. */
  hostname: string | null;
  /** Best favicon URL we know about — stored or Google fallback. */
  favicon: string | null;
  /** Google's favicon service URL, used as the error-cascade fallback. */
  googleFaviconUrl: string | null;
  /** Display-ready title: fetched title for successful URLs, hostname otherwise. */
  displayTitle: string;
  /** Whether the URL failed to fetch or is still pending. */
  isPending: boolean;
  isFailed: boolean;
}

/**
 * Derive all the display-ready fields we need to render a URL chip/card.
 * Centralizes hostname parsing, favicon fallback, and pending/failed checks
 * that were previously duplicated across UrlCard, SourceCard, and UrlCardCompact.
 */
export function getUrlDisplay(url: SerializedTodoUrl): UrlDisplay {
  const isPending = url.fetchStatus === "pending";
  const isFailed = url.fetchStatus === "failed";

  let hostname: string | null = null;
  try {
    const parsed = new URL(url.url);
    if (parsed.hostname) hostname = parsed.hostname;
  } catch {
    // Malformed URL — hostname stays null.
  }

  const googleFaviconUrl = hostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`
    : null;

  const displayTitle =
    isPending || isFailed
      ? (hostname ?? url.url)
      : (url.title ?? url.siteName ?? hostname ?? url.url);

  return {
    hostname,
    favicon: url.favicon ?? googleFaviconUrl,
    googleFaviconUrl,
    displayTitle,
    isPending,
    isFailed,
  };
}

/** Hostname with the `www.` prefix stripped, or null for a malformed URL. */
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Whether `title` is one of the placeholders generated for a captured link —
 * the raw URL itself, or the API's `createFallbackFromUrl` "Check {domain}" —
 * rather than something the user actually typed. Mirrors the API's own
 * `isPlaceholderTitle` (src/api/src/lib/url-helpers.ts), which gates whether
 * fetched metadata is allowed to overwrite the title.
 */
export function isPlaceholderTitle(title: string, url: string): boolean {
  const trimmed = title.trim();
  if (trimmed === url.trim()) return true;
  const domain = extractDomain(url);
  return domain !== null && trimmed === `Check ${domain}`;
}

/**
 * A short placeholder title for a bare captured link — "Check {domain}",
 * matching the API's `createFallbackFromUrl`, or the raw URL if it's
 * malformed and has no domain to name.
 */
export function placeholderTitleForUrl(url: string): string {
  const domain = extractDomain(url);
  return domain ? `Check ${domain}` : url;
}

const EMBEDDED_URL_REGEX = /(\s*)([([]?)(https?:\/\/[^\s]+)/g;
const TRAILING_URL_PUNCTUATION = /[.,;:!?)\]]+$/;
const CLOSING_BRACKET: Record<string, string> = { "(": ")", "[": "]" };

/**
 * Strip any attached-link URL that appears verbatim inside a todo's title, so
 * the URL only ever shows once — in the preview card below — rather than
 * duplicated inline in the title text. A title with unrelated text and no
 * matching URL substring is returned unchanged.
 */
export function stripLinkedUrlsFromTitle(
  title: string,
  urls: SerializedTodoUrl[],
): string {
  if (urls.length === 0) return title;
  const known = new Set(urls.map((url) => url.url));
  const stripped = title.replace(
    EMBEDDED_URL_REGEX,
    (match, space: string, open: string, found: string) => {
      const trimmed = found.replace(TRAILING_URL_PUNCTUATION, "");
      const bare = known.has(found)
        ? found
        : known.has(trimmed)
          ? trimmed
          : null;
      if (!bare) return match;
      // Keep the punctuation that trailed the URL, but drop a bracket pair
      // that only wrapped it, so "(url)." leaves "." rather than "(".
      let tail = found.slice(bare.length);
      let lead = open;
      if (open && tail.startsWith(CLOSING_BRACKET[open])) {
        tail = tail.slice(1);
        lead = "";
      }
      // Punctuation that's left hugs the preceding word: "see (url)." → "see."
      if (!lead && /^[.,;:!?]/.test(tail)) return tail;
      return space + lead + tail;
    },
  );
  return stripped.replace(/\s+/g, " ").trim();
}

/**
 * Best human-readable title for a fetched URL — the author name for social
 * links (parsed from "Name (@handle) …" og:titles), otherwise the page title or
 * site name. Null when the URL hasn't been fetched or has no usable title.
 */
export function getFetchedPreviewTitle(url: SerializedTodoUrl): string | null {
  if (url.fetchStatus !== "fetched") return null;
  if (getSocialUrlInfo(url.url)) {
    const author = parseSocialAuthor(url.title);
    if (author) return author.name;
  }
  return url.title ?? url.siteName ?? null;
}

/**
 * Build the `onError` handler that cascades a broken stored favicon to Google's
 * service, then hides the image entirely if both fail.
 */
export function buildFaviconErrorHandler(
  url: SerializedTodoUrl,
  googleFaviconUrl: string | null,
): React.ReactEventHandler<HTMLImageElement> {
  return (event) => {
    const img = event.currentTarget;
    if (url.favicon && googleFaviconUrl && img.src !== googleFaviconUrl) {
      img.src = googleFaviconUrl;
      return;
    }
    img.style.display = "none";
  };
}
