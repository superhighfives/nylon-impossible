/**
 * URL handling utilities for smart todo creation
 */

/** Common trailing punctuation that shouldn't be part of URLs */
const TRAILING_PUNCT = /[.,;:!?)]+$/;

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
