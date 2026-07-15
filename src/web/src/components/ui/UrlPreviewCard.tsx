import { ExternalLink, Link2 } from "lucide-react";
import { getSocialUrlInfo } from "@/lib/social-urls";
import { buildFaviconErrorHandler, getUrlDisplay } from "@/lib/url-display";
import type { SerializedTodoUrl } from "@/types/database";
import { Loader } from "./Loader";
import { SocialPreviewCardCompact } from "./SocialPreviewCard";

/** Pending URLs older than this are treated as failed (worker likely restarted) */
const STALE_PENDING_THRESHOLD_MS = 30_000;

interface UrlPreviewCardProps {
  url: SerializedTodoUrl;
}

/**
 * The canonical link card for the main todo list: one big hoverable card
 * (favicon + title + description + URL) that opens the link. Used both for
 * URL-only todos and for links nested under a titled todo, so the two read the
 * same. Mirrors the URL card in the expanded editor.
 */
export function UrlPreviewCard({ url }: UrlPreviewCardProps) {
  // Preview turned off — collapse back to just the raw URL.
  if (!url.showPreview) {
    const { favicon, googleFaviconUrl } = getUrlDisplay(url);
    return (
      <a
        href={url.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-lg bg-gray-surface p-3 shadow-sm transition-shadow hover:shadow-base group/link"
      >
        {favicon ? (
          <img
            src={favicon}
            alt=""
            loading="lazy"
            className="w-4 h-4 shrink-0"
            onError={buildFaviconErrorHandler(url, googleFaviconUrl)}
          />
        ) : (
          <Link2 size={16} className="w-4 h-4 shrink-0 text-gray-muted" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-gray group-hover/link:underline">
          {url.url}
        </span>
        <ExternalLink size={14} className="shrink-0 text-gray-muted" />
      </a>
    );
  }

  // Rich social links keep their compact platform card in the dense list.
  if (url.fetchStatus === "fetched" && getSocialUrlInfo(url.url)) {
    return <SocialPreviewCardCompact url={url} />;
  }

  const isStale =
    url.fetchStatus === "pending" &&
    Date.now() - new Date(url.createdAt).getTime() > STALE_PENDING_THRESHOLD_MS;
  // Treat stale pending URLs as settled (fetch likely lost to a worker restart).
  const isPending = url.fetchStatus === "pending" && !isStale;
  const { favicon, googleFaviconUrl, displayTitle } = getUrlDisplay(url);

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 rounded-lg bg-gray-surface p-3 shadow-sm transition-shadow hover:shadow-base group/link"
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
      ) : (
        <Link2 size={16} className="w-4 h-4 mt-0.5 shrink-0 text-gray-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray wrap-anywhere group-hover/link:underline">
          {displayTitle}
          {isPending && (
            <span className="ml-2 text-xs font-normal text-gray-muted">
              Fetching…
            </span>
          )}
        </p>
        {!isPending && url.description && (
          <p className="mt-0.5 text-xs text-gray-muted line-clamp-2 leading-relaxed">
            {url.description}
          </p>
        )}
        <p className="mt-1 truncate text-xs text-gray-muted">{url.url}</p>
      </div>
      <ExternalLink size={14} className="mt-0.5 shrink-0 text-gray-muted" />
    </a>
  );
}
