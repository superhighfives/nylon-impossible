import { getSocialUrlInfo } from "@/lib/social-urls";
import type { SerializedTodoUrl } from "@/types/database";

interface SocialPreviewCardProps {
  url: SerializedTodoUrl;
}

/** X (Twitter) logo as an inline SVG */
function XLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Instagram logo */
function InstagramLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

/** YouTube logo */
function YouTubeLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function PlatformBadge({
  platform,
}: {
  platform: "twitter" | "instagram" | "youtube";
}) {
  if (platform === "twitter") {
    return <XLogo className="w-3.5 h-3.5 text-gray shrink-0" />;
  }
  if (platform === "instagram") {
    return <InstagramLogo className="w-3.5 h-3.5 text-gray shrink-0" />;
  }
  return <YouTubeLogo className="w-3.5 h-3.5 text-red shrink-0" />;
}

/**
 * Rich social preview card for URLs from Twitter/X, Instagram, and YouTube.
 *
 * Shows:
 * - Platform logo
 * - Author/title parsed from og:title
 * - Description (tweet text, bio, video title)
 * - og:image thumbnail when available
 */
export function SocialPreviewCard({ url }: SocialPreviewCardProps) {
  const social = getSocialUrlInfo(url.url);
  if (!social) return null;

  const { platform, isPost, hostname } = social;

  // Parse author info out of the og:title, e.g. "Name (@handle) on X"
  // or "Name (@handle)" for profiles.
  let authorName: string | null = null;
  let authorHandle: string | null = null;
  if (url.title) {
    const match = url.title.match(/^(.+?)\s+\(@([^)]+)\)/);
    if (match) {
      authorName = match[1].trim();
      authorHandle = `@${match[2]}`;
    } else {
      authorName = url.title;
    }
  }

  const displayTitle = authorName ?? url.siteName ?? hostname;
  const bodyText = url.description;

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl border border-gray-line bg-gray-surface shadow-sm hover:shadow-base transition-shadow overflow-hidden group"
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        {/* Profile picture / thumbnail */}
        {url.image && !isPost ? (
          <img
            src={url.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full shrink-0 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray truncate group-hover:underline leading-tight">
            {displayTitle}
          </p>
          {authorHandle && (
            <p className="text-xs text-gray-muted truncate leading-tight">
              {authorHandle}
            </p>
          )}
        </div>

        <PlatformBadge platform={platform} />
      </div>

      {/* Body text */}
      {bodyText && (
        <p className="px-3 pb-3 text-xs text-gray-muted line-clamp-3 leading-relaxed">
          {bodyText}
        </p>
      )}

      {/* Post image (for tweets/posts with attached images) */}
      {url.image && isPost && (
        <img
          src={url.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full max-h-40 object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </a>
  );
}

/**
 * Compact variant for the main todo list row.
 * Shows platform logo + title on one line, same as UrlCardCompact but with the
 * correct platform icon.
 */
export function SocialPreviewCardCompact({ url }: SocialPreviewCardProps) {
  const social = getSocialUrlInfo(url.url);
  if (!social) return null;

  let authorName: string | null = null;
  if (url.title) {
    const match = url.title.match(/^(.+?)\s+\(@([^)]+)\)/);
    authorName = match ? match[1].trim() : url.title;
  }
  const displayTitle = authorName ?? url.siteName ?? social.hostname;

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-surface shadow-sm hover:shadow-base transition-shadow group max-w-full"
    >
      <PlatformBadge platform={social.platform} />
      <span className="text-sm text-gray truncate group-hover:underline">
        {displayTitle}
      </span>
    </a>
  );
}
