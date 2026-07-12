import { getSocialUrlInfo } from "@/lib/social-urls";
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

/**
 * The single user-facing URL of a "URL-only" todo — one whose title is just the
 * URL itself or the auto-generated "Check {domain}" placeholder, and that has
 * exactly one non-research link. Returns null for todos with a real,
 * user-written title or with zero/multiple links so their rendering is
 * untouched.
 */
export function getUrlOnlyUrl(todo: {
  title: string;
  urls: SerializedTodoUrl[];
}): SerializedTodoUrl | null {
  const links = todo.urls.filter((url) => !url.researchId);
  if (links.length !== 1) return null;
  const url = links[0];
  const title = todo.title.trim();
  if (title === url.url.trim()) return url;

  let domain: string | null = null;
  try {
    domain = new URL(url.url).hostname.replace(/^www\./, "");
  } catch {
    // Malformed URL — no domain to match against.
  }
  if (domain && title === `Check ${domain}`) return url;
  return null;
}

/**
 * Best human-readable title for a fetched URL — the author name for social
 * links (parsed from "Name (@handle) …" og:titles), otherwise the page title or
 * site name. Null when the URL hasn't been fetched or has no usable title.
 */
export function getFetchedPreviewTitle(url: SerializedTodoUrl): string | null {
  if (url.fetchStatus !== "fetched") return null;
  if (getSocialUrlInfo(url.url) && url.title) {
    const match = url.title.match(/^(.+?)\s+\(@([^)]+)\)/);
    return match ? match[1].trim() : url.title;
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
