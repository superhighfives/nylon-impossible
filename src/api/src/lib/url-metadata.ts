/**
 * URL metadata fetching utility
 *
 * Extracts Open Graph, Twitter Card, and standard meta tags from URLs.
 * Used to enrich todo items with link previews.
 */

export interface UrlMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
  favicon: string | null;
}

const NULL_METADATA: UrlMetadata = {
  title: null,
  description: null,
  siteName: null,
  favicon: null,
};

/**
 * Extract content from a meta tag by property or name attribute.
 *
 * Handles both `<meta property="og:title">` and `<meta name="description">` patterns.
 */
function extractMeta(html: string, property: string): string | null {
  // Match property="..." or name="..." with content="..."
  // Order can vary: content may come before or after property/name
  const propertyPattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const contentFirstPattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );

  const propertyMatch = html.match(propertyPattern);
  if (propertyMatch) return propertyMatch[1];

  const contentFirstMatch = html.match(contentFirstPattern);
  if (contentFirstMatch) return contentFirstMatch[1];

  return null;
}

/**
 * Extract the page title from the <title> tag.
 */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match) return null;
  return match[1].trim() || null;
}

/**
 * Extract favicon URL, resolving relative paths against the base URL.
 *
 * Checks for explicit link tags first, falls back to /favicon.ico.
 */
function extractFavicon(html: string, baseUrl: string): string | null {
  // Match <link rel="icon" href="..."> or <link rel="shortcut icon" href="...">
  // Also handles apple-touch-icon as a fallback
  const iconPatterns = [
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
  ];

  for (const pattern of iconPatterns) {
    const match = html.match(pattern);
    if (match) {
      return resolveUrl(match[1], baseUrl);
    }
  }

  // Fall back to /favicon.ico at the origin
  try {
    const url = new URL(baseUrl);
    return `${url.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

/**
 * Resolve a potentially relative URL against a base URL.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Extract the hostname without www prefix for use as a fallback site name.
 */
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Timeout for metadata fetch requests (10 seconds) */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch and extract metadata from a URL.
 *
 * Extracts Open Graph tags, Twitter Card tags, and standard meta tags.
 * Returns null values for any metadata that cannot be extracted.
 * Times out after 10 seconds to prevent hanging on slow/unresponsive servers.
 */
export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "NylonBot/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return NULL_METADATA;
  }

  if (!response.ok) return NULL_METADATA;

  let html: string;
  try {
    html = await response.text();
  } catch {
    return NULL_METADATA;
  }

  // Prefer Open Graph, then Twitter Card, then standard meta/title
  const title =
    extractMeta(html, "og:title") ??
    extractMeta(html, "twitter:title") ??
    extractTitle(html);

  const description =
    extractMeta(html, "og:description") ??
    extractMeta(html, "twitter:description") ??
    extractMeta(html, "description");

  const siteName = extractMeta(html, "og:site_name") ?? extractHostname(url);

  const favicon = extractFavicon(html, url);

  return { title, description, siteName, favicon };
}
