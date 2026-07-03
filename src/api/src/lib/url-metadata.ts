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
  image: string | null;
}

const NULL_METADATA: UrlMetadata = {
  title: null,
  description: null,
  siteName: null,
  favicon: null,
  image: null,
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decode HTML entities (named like `&amp;` and numeric like `&#039;` / `&#x27;`)
 * so titles/descriptions read as plain text instead of raw markup.
 */
function decodeHtmlEntities(text: string | null): string | null {
  if (!text) return text;
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, entity) => {
      if (entity[0] === "#") {
        const isHex = entity[1] === "x" || entity[1] === "X";
        const code = Number.parseInt(
          entity.slice(isHex ? 2 : 1),
          isHex ? 16 : 10,
        );
        if (Number.isNaN(code)) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[entity] ?? match;
    },
  );
}

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

// Matches a tweet permalink and captures its numeric id, e.g.
// x.com/user/status/123, twitter.com/i/web/status/123.
const TWEET_URL_RE =
  /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?:[^/?#]+|i\/(?:web\/)?)\/?status(?:es)?\/(\d+)/i;

function extractTweetId(url: string): string | null {
  return url.match(TWEET_URL_RE)?.[1] ?? null;
}

// X blocks the tweet text from the page HTML for bots, but its public
// syndication endpoint (the one embeds/react-tweet use) returns the tweet as
// JSON without auth. The token is a deterministic value derived from the id.
function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

interface TweetResult {
  text?: string;
  user?: { name?: string; screen_name?: string };
  photos?: { url?: string }[];
  mediaDetails?: { media_url_https?: string }[];
}

/**
 * Fetch tweet content (text, author, first image) from X's public syndication
 * endpoint. Returns null on any failure so the caller can fall back to the
 * normal HTML scrape.
 */
async function fetchTweetMetadata(id: string): Promise<UrlMetadata | null> {
  const endpoint = new URL("https://cdn.syndication.twimg.com/tweet-result");
  endpoint.searchParams.set("id", id);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("token", syndicationToken(id));

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { "User-Agent": "NylonBot/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let data: TweetResult;
  try {
    data = (await response.json()) as TweetResult;
  } catch {
    return null;
  }

  // A tombstone (deleted/protected tweet) has no text — treat as a miss.
  if (!data?.text) return null;

  const name = data.user?.name?.trim() || null;
  const handle = data.user?.screen_name?.trim();
  // Match the "Name (@handle)" shape the web card parses author info from.
  const title = name && handle ? `${name} (@${handle})` : name;
  const image =
    data.photos?.find((p) => p.url)?.url ??
    data.mediaDetails?.find((m) => m.media_url_https)?.media_url_https ??
    null;

  // X appends a trailing t.co link for attached media; strip it so a
  // media-only tweet reads as no body rather than a bare shortlink.
  const text = data.text
    .replace(/(?:\s*https:\/\/t\.co\/\w+)+\s*$/i, "")
    .trim();

  return {
    title,
    description: text || null,
    siteName: "X",
    favicon: "https://abs.twimg.com/favicons/twitter.3.ico",
    image,
  };
}

/**
 * Fetch and extract metadata from a URL.
 *
 * Extracts Open Graph tags, Twitter Card tags, and standard meta tags.
 * Returns null values for any metadata that cannot be extracted.
 * Times out after 10 seconds to prevent hanging on slow/unresponsive servers.
 */
export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  // Tweets don't expose their text to bots via HTML — pull it from X's
  // syndication endpoint first, falling back to the scrape below if that fails.
  const tweetId = extractTweetId(url);
  if (tweetId) {
    const tweet = await fetchTweetMetadata(tweetId);
    if (tweet) return tweet;
  }

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

  const rawImage =
    extractMeta(html, "og:image") ??
    extractMeta(html, "twitter:image") ??
    extractMeta(html, "twitter:image:src");
  const image = rawImage ? (resolveUrl(rawImage, url) ?? rawImage) : null;

  return {
    title: decodeHtmlEntities(title),
    description: decodeHtmlEntities(description),
    siteName: decodeHtmlEntities(siteName),
    favicon,
    image,
  };
}
