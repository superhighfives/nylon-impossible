import type { SerializedTodoUrl } from "@/types/database";
import { Loader } from "./loader";

/** Pending URLs older than this are treated as failed (worker likely restarted) */
const STALE_PENDING_THRESHOLD_MS = 30_000;

interface UrlCardCompactProps {
  url: SerializedTodoUrl;
}

export function UrlCardCompact({ url }: UrlCardCompactProps) {
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

  // Favicon: use fetched or Google's favicon service (only if we have a valid hostname)
  const favicon =
    url.favicon ??
    (validHostname
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(validHostname)}&sz=32`
      : null);

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-ui hover:bg-gray-3 transition-colors group max-w-full"
    >
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 shrink-0" />
      ) : favicon ? (
        <img
          src={favicon}
          alt=""
          className="w-4 h-4 shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="text-sm text-gray-normal truncate group-hover:underline">
        {displayTitle}
      </span>
      {isPending && (
        <span className="text-xs text-gray-dim shrink-0">Fetching...</span>
      )}
    </a>
  );
}
