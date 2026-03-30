import { AlertCircle, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import {
  SHOW_RETRY_MS,
  STALE_RESEARCH_MS,
  useCancelResearch,
  useReresearch,
} from "@/hooks/useTodos";
import type { SerializedResearch, SerializedTodoUrl } from "@/types/database";
import { Button, Loader } from "./ui";

interface ResearchSectionProps {
  todoId: string;
  research: SerializedResearch;
  researchUrls: SerializedTodoUrl[];
}

/**
 * Format summary text with clickable citation links.
 * Converts [1], [2], etc. into links that open the corresponding source URL in a new tab.
 */
function formatSummaryWithCitations(
  summary: string,
  urls: SerializedTodoUrl[],
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(summary);

  while (match !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(summary.slice(lastIndex, match.index));
    }

    const citationNum = Number.parseInt(match[1], 10);
    const url = urls[citationNum - 1];

    if (url) {
      parts.push(
        <a
          key={`citation-${match.index}`}
          href={url.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-yellow-11 dark:text-yellowdark-11 hover:underline font-medium"
        >
          [{citationNum}]
        </a>,
      );
    } else {
      // No matching URL, keep as plain text
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
    match = regex.exec(summary);
  }

  // Add remaining text after last citation
  if (lastIndex < summary.length) {
    parts.push(summary.slice(lastIndex));
  }

  return parts;
}

function SourceCard({
  url,
  citationNumber,
}: {
  url: SerializedTodoUrl;
  citationNumber: number;
}) {
  const isPending = url.fetchStatus === "pending";
  const isFailed = url.fetchStatus === "failed";

  let validHostname: string | null = null;
  try {
    const parsed = new URL(url.url);
    if (parsed.hostname) validHostname = parsed.hostname;
  } catch {
    // invalid URL
  }

  const displayTitle =
    isPending || isFailed
      ? (validHostname ?? url.url)
      : (url.title ?? url.siteName ?? validHostname ?? url.url);

  const googleFaviconUrl = validHostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(validHostname)}&sz=32`
    : null;
  const favicon = url.favicon ?? googleFaviconUrl;

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 rounded-lg bg-gray-base hover:bg-gray-hover transition-colors group"
    >
      <span className="text-xs font-semibold text-yellow-11 dark:text-yellowdark-11 bg-yellow-base px-1.5 py-0.5 rounded shrink-0">
        [{citationNumber}]
      </span>
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 mt-0.5 shrink-0 text-gray-muted" />
      ) : isFailed ? (
        <AlertCircle
          size={16}
          className="w-4 h-4 mt-0.5 shrink-0 text-red-muted"
        />
      ) : favicon ? (
        <img
          src={favicon}
          alt=""
          className="w-4 h-4 mt-0.5 shrink-0"
          onError={(e) => {
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
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-muted truncate group-hover:underline">
          {displayTitle}
        </p>
        <p className="text-xs text-gray-muted mt-0.5 truncate">{url.url}</p>
      </div>
      <ExternalLink size={14} className="text-gray-muted shrink-0 mt-0.5" />
    </a>
  );
}

export function ResearchSection({
  todoId,
  research,
  researchUrls,
}: ResearchSectionProps) {
  const reresearch = useReresearch();
  const cancelResearch = useCancelResearch();

  if (research.status === "pending") {
    const age = Date.now() - new Date(research.createdAt).getTime();
    const isStale = age > STALE_RESEARCH_MS;
    const showRetry = age > SHOW_RETRY_MS;

    if (isStale) {
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-muted flex items-center gap-1">
            <Sparkles size={12} />
            Research
          </p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-muted">Research timed out.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => reresearch.mutate(todoId)}
              disabled={reresearch.isPending}
              loading={reresearch.isPending}
            >
              <RefreshCw size={14} className="mr-1" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-muted flex items-center gap-1">
          <Sparkles size={12} />
          Research
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-muted">
            <Loader size="sm" />
            <span>Researching...</span>
          </div>
          {showRetry && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelResearch.mutate(todoId)}
                disabled={cancelResearch.isPending || reresearch.isPending}
                loading={cancelResearch.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => reresearch.mutate(todoId)}
                disabled={reresearch.isPending || cancelResearch.isPending}
                loading={reresearch.isPending}
              >
                <RefreshCw size={14} className="mr-1" />
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (research.status === "failed") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-muted flex items-center gap-1">
          <Sparkles size={12} />
          Research
        </p>
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-muted">Research failed.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reresearch.mutate(todoId)}
            disabled={reresearch.isPending}
            loading={reresearch.isPending}
          >
            <RefreshCw size={14} className="mr-1" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // Completed
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-muted flex items-center gap-1">
          <Sparkles size={12} />
          Research
        </p>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => reresearch.mutate(todoId)}
          disabled={reresearch.isPending}
          aria-label="Refresh research"
        >
          <RefreshCw
            size={12}
            className={reresearch.isPending ? "animate-spin" : ""}
          />
        </Button>
      </div>

      {research.summary && (
        <p className="text-sm text-gray leading-relaxed">
          {formatSummaryWithCitations(research.summary, researchUrls)}
        </p>
      )}

      {researchUrls.length > 0 && (
        <div className="space-y-2">
          {researchUrls.map((url, index) => (
            <SourceCard key={url.id} url={url} citationNumber={index + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
