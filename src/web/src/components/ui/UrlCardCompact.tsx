import type { SerializedTodoUrl } from "@/types/database";
import { getSocialUrlInfo } from "@/lib/social-urls";
import { SocialPreviewCardCompact } from "./SocialPreviewCard";
import { Loader } from "./loader";

/** Pending URLs older than this are treated as failed (worker likely restarted) */
const STALE_PENDING_THRESHOLD_MS = 30_000;

interface UrlCardCompactProps {
  url: SerializedTodoUrl;
}

export function UrlCardCompact({ url }: UrlCardCompactProps) {
  // Use rich social card for fetched social URLs
  if (url.fetchStatus === "fetched" && getSocialUrlInfo(url.url)) {
    return <SocialPreviewCardCompact url={url} />;
  }

  // Treat stale pending URLs as failed (fetch likely lost due to worker restart)
  const isStale =
    url.fetchStatus === "pending" &&
    Date.now() - new Date(url.createdAt).getTime() > STALE_PENDING_THRESHOLD_MS;
  const isPending = url.fetchStatus === "pending" && !isStale;
  const isFailed = url.fetchStatus === "failed" || isStale;

  // Extract hostname for pending/failed states and favicon fallback
  let hostname: string;
  let validHostname: string | null = null;
  try {
    const parsed = new URL(url.url);
    hostname = parsed.hostname;
    validHostname = parsed.hostname;
  } catch {
    hostname = url.url;
  }

  // Use fetched title, or fall back to hostname
  const displayTitle =
    isPending || isFailed ? hostname : (url.title ?? url.siteName ?? hostname);

  // Favicon: use fetched URL, falling back to Google's favicon service
  const googleFaviconUrl = validHostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(validHostname)}&sz=32`
    : null;
  const favicon = url.favicon ?? googleFaviconUrl;

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-surface shadow-sm hover:shadow-base transition-shadow group max-w-full"
    >
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 shrink-0 text-gray-muted" />
      ) : favicon ? (
        <img
          src={favicon}
          alt=""
          className="w-4 h-4 shrink-0"
          onError={(e) => {
            // If the stored favicon fails, cascade to Google's service
            if (
              url.favicon &&
              googleFaviconUrl &&
              e.currentTarget.src !== googleFaviconUrl
            ) {
              e.currentTarget.src = googleFaviconUrl;
            } else {
              e.currentTarget.style.display = "none";
            }
          }}
        />
      ) : null}
      <span className="text-sm text-gray truncate group-hover:underline">
        {displayTitle}
      </span>
      {isPending && (
        <span className="text-xs text-gray-muted shrink-0">Fetching...</span>
      )}
    </a>
  );
}
