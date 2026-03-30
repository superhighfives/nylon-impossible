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
  /** Hostname of the parsed URL, reused to avoid double-parsing in components */
  hostname: string;
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
  const path = parsed.pathname;

  if (TWITTER_HOSTS.has(host)) {
    // Standard tweet:       /user/status/id
    // Canonical/i forms:    /i/status/id  and  /i/web/status/id
    const isTweet =
      /^\/[^/]+\/status\/\d+/.test(path) ||
      /^\/i\/(web\/)?status\/\d+/.test(path);
    return { platform: "twitter", isPost: isTweet, hostname: host };
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    // Post: /p/id or /reel/id
    const isPost = /^\/(p|reel)\//.test(path);
    return { platform: "instagram", isPost, hostname: host };
  }

  if (YOUTUBE_HOSTS.has(host)) {
    // Video: /watch?v=  or  youtu.be/<id>  or  /shorts/<id>
    const isVideo =
      (host === "youtu.be" && path.length > 1) ||
      parsed.searchParams.has("v") ||
      /^\/shorts\//.test(path);
    return { platform: "youtube", isPost: isVideo, hostname: host };
  }

  return null;
}
