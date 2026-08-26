/**
 * URL handling utilities for smart todo creation
 */

import { isSocialPostUrl, type UrlMetadata } from "./url-metadata";

/** Common trailing punctuation that shouldn't be part of URLs */
const TRAILING_PUNCT = /[.,;:!?)]+$/;

/** URL regex to extract URLs from text */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Validate and clean a URL string.
 * Returns null if the URL is invalid.
 */
function cleanUrl(urlString: string): string | null {
  const cleaned = urlString.replace(TRAILING_PUNCT, "");
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Extract and validate all URLs from a text string.
 * Returns unique, validated URLs in order of appearance.
 */
export function extractUrlsFromText(text: string): string[] {
  const rawMatches = text.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of rawMatches) {
    const cleaned = cleanUrl(match);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      urls.push(cleaned);
    }
  }
  return urls;
}

/**
 * Clean a URL string by stripping trailing punctuation.
 * Returns the cleaned URL or the original if cleaning fails.
 */
export function cleanUrlString(urlString: string): string {
  return urlString.replace(TRAILING_PUNCT, "");
}

/**
 * Extract the domain from a URL string.
 * Strips www. prefix and returns just the hostname.
 * Returns null if the URL is invalid.
 */
export function extractDomain(urlString: string): string | null {
  if (!urlString || typeof urlString !== "string") {
    return null;
  }

  try {
    const url = new URL(cleanUrlString(urlString));
    // Only allow http/https
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // Strip www. prefix
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Create a fallback todo from a URL when AI fails or is unavailable.
 * Returns a title like "Check example.com" and the cleaned URL.
 * Returns null if the URL is invalid.
 */
export function createFallbackFromUrl(
  urlString: string,
): { title: string; url: string } | null {
  // Clean trailing punctuation before processing
  const cleaned = cleanUrlString(urlString);
  const domain = extractDomain(cleaned);
  if (!domain) {
    return null;
  }

  // Normalize URL via URL constructor
  let normalizedUrl: string;
  try {
    normalizedUrl = new URL(cleaned).href;
  } catch {
    return null;
  }

  return {
    title: `Check ${domain}`,
    url: normalizedUrl,
  };
}

/**
 * Truncate a title to fit within the specified character limit.
 * Uses grapheme-aware truncation to avoid splitting emoji/surrogate pairs.
 * Attempts to truncate at word boundaries when possible.
 * Adds "..." suffix if truncated.
 */
export function truncateTitle(title: string, maxLength = 500): string {
  if (title.length <= maxLength) {
    return title;
  }

  // Reserve space for ellipsis
  const targetLength = maxLength - 3;

  // Use Array.from to handle surrogate pairs correctly
  // This splits by code points, not UTF-16 code units
  const codePoints = Array.from(title);

  if (codePoints.length <= maxLength) {
    // String length in code units exceeds limit but code points don't
    // This shouldn't happen often, but handle it safely
    return title;
  }

  // Truncate by code points
  const truncatedCodePoints = codePoints.slice(0, targetLength);
  const truncated = truncatedCodePoints.join("");

  // Try to find a word boundary to truncate at
  const lastSpace = truncated.lastIndexOf(" ");

  // If there's a space in the last 20% of the string, truncate there
  // Otherwise just hard truncate (handles very long words/URLs)
  if (lastSpace > truncated.length * 0.8) {
    return `${truncated.slice(0, lastSpace)}...`;
  }

  return `${truncated}...`;
}

/**
 * Longest a title derived from link metadata gets. Comfortably longer than a
 * glance needs, short enough that a tweet or a verbose page title doesn't take
 * over the row.
 */
const DERIVED_TITLE_MAX = 140;

/** Collapse whitespace/newlines into single spaces; null for nothing usable. */
function collapseWhitespace(text: string | null | undefined): string | null {
  const collapsed = text?.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed : null;
}

/** Trim a derived title to `DERIVED_TITLE_MAX`, preferring a word boundary. */
function shortenDerivedTitle(text: string): string {
  if (text.length <= DERIVED_TITLE_MAX) return text;
  const cut = text.slice(0, DERIVED_TITLE_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > cut.length * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(TRAILING_PUNCT, "")}…`;
}

/** `https://example.com/` and `https://example.com` are the same link here. */
function withoutTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Whether `title` is one of the placeholders we generate for a captured link —
 * the raw URL, or `createFallbackFromUrl`'s "Check {domain}".
 *
 * This is the guard on rewriting a title from fetched metadata: a placeholder
 * is ours to replace, anything the user typed is not.
 */
export function isPlaceholderTitle(title: string, url: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (
    withoutTrailingSlash(trimmed) ===
    withoutTrailingSlash(cleanUrlString(url).trim())
  ) {
    return true;
  }
  const domain = extractDomain(url);
  return domain !== null && trimmed === `Check ${domain}`;
}

/**
 * A human title for a captured link, from the metadata we fetched for it.
 *
 * For a post (a tweet), the post's own text is what says what the link is —
 * the author is already shown on the preview card, so repeating it in the title
 * would just spend the row twice. Everywhere else the page title is the answer.
 * Returns null when the metadata has nothing better than the placeholder,
 * leaving "Check {domain}" in place rather than replacing it with noise.
 */
export function titleFromUrlMetadata(
  url: string,
  metadata: Pick<UrlMetadata, "title" | "description" | "siteName">,
): string | null {
  if (isSocialPostUrl(url)) {
    // A media-only post has no text; its author line ("Name (@handle)") is the
    // next best thing.
    const text =
      collapseWhitespace(metadata.description) ??
      collapseWhitespace(metadata.title);
    return text ? shortenDerivedTitle(text) : null;
  }

  const pageTitle = collapseWhitespace(metadata.title);
  if (pageTitle) return shortenDerivedTitle(pageTitle);

  // A site that names itself something other than its own domain still beats
  // "Check example.com"; one that doesn't adds nothing.
  const siteName = collapseWhitespace(metadata.siteName);
  if (siteName && siteName !== extractDomain(url)) {
    return shortenDerivedTitle(siteName);
  }
  return null;
}
