/**
 * URL handling utilities for smart todo creation
 */

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
    const url = new URL(urlString);
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
  const domain = extractDomain(urlString);
  if (!domain) {
    return null;
  }

  // Clean the URL (normalize it via URL constructor)
  let cleanedUrl: string;
  try {
    cleanedUrl = new URL(urlString).href;
  } catch {
    return null;
  }

  return {
    title: `Check ${domain}`,
    url: cleanedUrl,
  };
}

/**
 * Truncate a title to fit within the specified character limit.
 * Attempts to truncate at word boundaries when possible.
 * Adds "..." suffix if truncated.
 */
export function truncateTitle(title: string, maxLength = 500): string {
  if (!title || title.length <= maxLength) {
    return title;
  }

  // Reserve space for ellipsis
  const targetLength = maxLength - 3;

  // Try to find a word boundary to truncate at
  const truncated = title.slice(0, targetLength);
  const lastSpace = truncated.lastIndexOf(" ");

  // If there's a space in the last 20% of the string, truncate there
  // Otherwise just hard truncate (handles very long words/URLs)
  if (lastSpace > targetLength * 0.8) {
    return `${truncated.slice(0, lastSpace)}...`;
  }

  return `${truncated}...`;
}
