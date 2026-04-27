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
