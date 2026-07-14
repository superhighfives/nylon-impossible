import { getSocialUrlInfo } from "@/lib/social-urls";
import { buildFaviconErrorHandler, getUrlDisplay } from "@/lib/url-display";
import type { SerializedTodoUrl } from "@/types/database";
import { Loader } from "./Loader";
import { SocialPreviewCardCompact } from "./SocialPreviewCard";

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

  const isStale =
    url.fetchStatus === "pending" &&
    Date.now() - new Date(url.createdAt).getTime() > STALE_PENDING_THRESHOLD_MS;
  const { favicon, googleFaviconUrl, displayTitle } = getUrlDisplay(url);
  // Treat stale pending URLs as failed (fetch likely lost due to worker restart)
  const isPending = url.fetchStatus === "pending" && !isStale;

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 px-2 py-1 rounded-lg bg-gray-surface shadow-sm hover:shadow-base transition-shadow group/link max-w-full"
    >
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 mt-0.5 shrink-0 text-gray-muted" />
      ) : favicon ? (
        <img
          src={favicon}
          alt=""
          loading="lazy"
          className="w-4 h-4 mt-0.5 shrink-0"
          onError={buildFaviconErrorHandler(url, googleFaviconUrl)}
        />
      ) : null}
      {/* Two lines: page title on top, description beneath. */}
      <span className="flex flex-col min-w-0">
        <span className="text-sm text-gray truncate group-hover/link:underline">
          {displayTitle}
        </span>
        {isPending ? (
          <span className="text-xs text-gray-muted">Fetching...</span>
        ) : (
          url.description && (
            <span className="text-xs text-gray-muted truncate">
              {url.description}
            </span>
          )
        )}
      </span>
    </a>
  );
}
