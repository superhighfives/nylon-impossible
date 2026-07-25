import { ExternalLink, Mail } from "lucide-react";
import { getEmailUrlInfo } from "@/lib/email-urls";
import { buildFaviconErrorHandler, getUrlDisplay } from "@/lib/url-display";
import type { SerializedTodoUrl } from "@/types/database";

/**
 * Display fields for an attached email link. The subject rides in on `title`
 * (set by the Gmail add-on); `siteName` carries the provider label. The favicon
 * resolves to the provider's icon (Gmail's) via the shared URL-display helper.
 */
function emailDisplay(url: SerializedTodoUrl) {
  const { favicon, googleFaviconUrl } = getUrlDisplay(url);
  const info = getEmailUrlInfo(url.url);
  const providerLabel = info?.provider === "gmail" ? "Gmail" : "Email";
  return {
    favicon,
    googleFaviconUrl,
    subject: url.title?.trim() || "Email",
    provider: url.siteName?.trim() || providerLabel,
  };
}

function EmailIcon({
  url,
  className,
}: {
  url: SerializedTodoUrl;
  className: string;
}) {
  const { favicon, googleFaviconUrl } = getUrlDisplay(url);
  return favicon ? (
    <img
      src={favicon}
      alt=""
      loading="lazy"
      className={className}
      onError={buildFaviconErrorHandler(url, googleFaviconUrl)}
    />
  ) : (
    <Mail size={16} className={`${className} text-gray-muted`} />
  );
}

/**
 * Full email link card for the expanded todo editor: mail icon + subject, with
 * the provider (Gmail) as the sub-label instead of the raw permalink. Opens the
 * thread in a new tab. Mirrors the URL card so the two read the same.
 */
export function EmailPreviewCard({ url }: { url: SerializedTodoUrl }) {
  const { subject, provider } = emailDisplay(url);
  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 rounded-lg bg-gray-surface shadow-sm transition-shadow hover:shadow-base group/link"
    >
      <EmailIcon url={url} className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray truncate group-hover/link:underline">
          {subject}
        </p>
        <p className="text-xs text-gray-muted mt-1 truncate">{provider}</p>
      </div>
      <ExternalLink size={14} className="text-gray-muted shrink-0 mt-0.5" />
    </a>
  );
}

/** Compact email link card for the dense main-list view. */
export function EmailPreviewCardCompact({ url }: { url: SerializedTodoUrl }) {
  const { subject, provider } = emailDisplay(url);
  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg bg-gray-surface p-3 shadow-sm transition-shadow hover:shadow-base group/link"
    >
      <EmailIcon url={url} className="w-4 h-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm text-gray group-hover/link:underline">
        {subject}
      </span>
      <span className="shrink-0 text-xs text-gray-muted">{provider}</span>
      <ExternalLink size={14} className="shrink-0 text-gray-muted" />
    </a>
  );
}
