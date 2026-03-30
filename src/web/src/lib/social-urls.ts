/**
 * Social URL detection utilities.
 *
 * Identifies URLs from social platforms so we can render richer preview cards.
 */

export type SocialPlatform = "twitter" | "instagram" | "youtube";

export interface SocialUrlInfo {
  platform: SocialPlatform;
  /** Whether this is a specific post/tweet vs a profile/channel page */
  isPost: boolean;
}

const TWITTER_HOSTS = new Set(["twitter.com", "x.com", "www.twitter.com", "www.x.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"]);

/**
 * Detect whether a URL is from a known social platform.
 * Returns null if not a recognized social URL.
 */
export function getSocialUrlInfo(urlString: string): SocialUrlInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (TWITTER_HOSTS.has(host)) {
    // Tweet: /user/status/id
    const isTweet = /^\/[^/]+\/status\/\d+/.test(parsed.pathname);
    return { platform: "twitter", isPost: isTweet };
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    // Post: /p/id or /reel/id
    const isPost = /^\/(p|reel)\//.test(parsed.pathname);
    return { platform: "instagram", isPost };
  }

  if (YOUTUBE_HOSTS.has(host)) {
    // Video: /watch?v= or youtu.be/id
    const isVideo =
      (parsed.hostname === "youtu.be" && parsed.pathname.length > 1) ||
      parsed.searchParams.has("v");
    return { platform: "youtube", isPost: isVideo };
  }

  return null;
}
