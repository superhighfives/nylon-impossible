import { AlertCircle, ExternalLink, Link2 } from "lucide-react";
import { getEmailUrlInfo } from "@/lib/email-urls";
import { getSocialUrlInfo } from "@/lib/social-urls";
import { buildFaviconErrorHandler, getUrlDisplay } from "@/lib/url-display";
import type { SerializedTodoUrl } from "@/types/database";
import { EmailPreviewCardCompact } from "./EmailPreviewCard";
import { Loader } from "./Loader";
import { SocialPreviewCardCompact } from "./SocialPreviewCard";

/** Pending URLs untouched for this long are treated as failed (worker likely restarted) */
const STALE_PENDING_THRESHOLD_MS = 30_000;

interface UrlPreviewCardProps {
  url: SerializedTodoUrl;
}

/**
 * The canonical link chip for the main todo list: a compact bordered
 * favicon + title row that opens the link, per the design's "Name of
 * Resource" chips. Used both for URL-only todos and for links nested under a
 * titled todo, so the two read the same. The expanded editor keeps its own
 * fuller card.
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
        className="group/link flex items-center gap-2.5 rounded-lg border border-gray-subtle px-2.5 py-1.5 transition-colors hover:border-gray hover:bg-gray-surface"
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
        <span className="min-w-0 flex-1 truncate text-sm text-gray">
          {url.url}
        </span>
        <ExternalLink
          size={14}
          className="shrink-0 text-gray-muted opacity-0 transition-opacity group-hover/link:opacity-100"
        />
      </a>
    );
  }

  // Attached email links (e.g. a Gmail thread) render as the message subject.
  if (getEmailUrlInfo(url.url)) {
    return <EmailPreviewCardCompact url={url} />;
  }

  // Rich social links keep their compact platform card in the dense list.
  if (url.fetchStatus === "fetched" && getSocialUrlInfo(url.url)) {
    return <SocialPreviewCardCompact url={url} />;
  }

  // Staleness is measured from `updatedAt`, not `createdAt`: re-processing an
  // old link flips it back to pending, and that fresh spinner shouldn't read as
  // stale just because the row was created weeks ago.
  const isStale =
    url.fetchStatus === "pending" &&
    Date.now() - new Date(url.updatedAt).getTime() > STALE_PENDING_THRESHOLD_MS;
  // Treat stale pending URLs as settled (fetch likely lost to a worker restart).
  const isPending = url.fetchStatus === "pending" && !isStale;
  const isFailed = url.fetchStatus === "failed" || isStale;
  const { favicon, googleFaviconUrl, displayTitle } = getUrlDisplay(url);

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      title={url.url}
      className="group/link flex items-center gap-2.5 rounded-lg border border-gray-subtle px-2.5 py-1.5 transition-colors hover:border-gray hover:bg-gray-surface"
    >
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 shrink-0 text-gray-muted" />
      ) : isFailed ? (
        <AlertCircle size={16} className="w-4 h-4 shrink-0 text-red-muted" />
      ) : favicon ? (
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
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray">
        {displayTitle}
        {isPending && (
          <span className="ml-2 text-xs font-normal text-gray-muted">
            Fetching…
          </span>
        )}
        {/* A fetch that never landed used to be indistinguishable from a page
            with no title — say so instead, so "Process links" reads as the
            obvious next move rather than a mystery. */}
        {isFailed && (
          <span className="ml-2 text-xs font-normal text-red-muted">
            Couldn't fetch
          </span>
        )}
      </span>
      <ExternalLink
        size={14}
        className="shrink-0 text-gray-muted opacity-0 transition-opacity group-hover/link:opacity-100"
      />
    </a>
  );
}
