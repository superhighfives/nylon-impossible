import { splitTodoText } from "./todo-text";

/** A URL in free text, as smart-create finds it. */
export const TEXT_URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** Common trailing punctuation that shouldn't be part of URLs. */
export const URL_TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

/**
 * Normalize a raw URL string to an `http:`/`https:` href, or null if it's not a
 * valid web URL. This is the single gate every URL the API persists passes
 * through, so a `javascript:`/`data:` (or otherwise malformed) value can never
 * reach the `todoUrls.url` column and later render as a clickable link.
 */
export function normalizeHttpUrl(raw: string): string | null {
  const cleaned = raw.replace(URL_TRAILING_PUNCTUATION, "");
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Invalid URL, skip
  }
  return null;
}

/**
 * The todo for a bare link: titled "Check {domain}" (without `www.`), with the
 * normalized URL. Null if the URL is invalid or has no host.
 */
export function createFallbackFromUrl(
  urlString: string,
): { title: string; url: string } | null {
  const cleaned = urlString.replace(URL_TRAILING_PUNCTUATION, "");
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const domain = url.hostname.replace(/^www\./, "");
    if (!domain) return null;
    return { title: `Check ${domain}`, url: url.href };
  } catch {
    return null;
  }
}

/**
 * What smart-create makes of a line of input before any typed date is parsed:
 * its title and notes, and the links it attaches (each fetched in the
 * background). Shared so the web's optimistic row matches what the API stores.
 */
export function createInitialTodo(text: string): {
  title: string;
  notes: string | null;
  urls: string[];
  /** Whether `title` is the input's whole first line, so it can be parsed. */
  titleIsTyped: boolean;
} {
  // A bare link (nothing but the URL, bar stray punctuation) is named after its
  // domain. Any words alongside it are the user's title, however long the URL.
  const urlMatch = text.match(TEXT_URL_REGEX);
  if (urlMatch && !/[\p{L}\p{N}]/u.test(text.replace(urlMatch[0], ""))) {
    const fallback = createFallbackFromUrl(urlMatch[0]);
    if (fallback) {
      return {
        title: fallback.title,
        notes: null,
        urls: [fallback.url],
        titleIsTyped: false,
      };
    }
  }

  // Extract any URLs from text
  const rawMatches = text.match(TEXT_URL_REGEX) ?? [];
  const urls = rawMatches
    .map(normalizeHttpUrl)
    .filter((url): url is string => url !== null);

  // Text that won't fit a title (or spans lines) keeps the overflow in notes
  // rather than being truncated away.
  const { title, notes } = splitTodoText(text);
  return {
    title,
    notes,
    urls: Array.from(new Set(urls)),
    // A clipped title ("…") or a hostname fallback isn't what was typed, so
    // its "end" isn't the end of the user's words.
    titleIsTyped: title === text.trim().split("\n")[0].trim(),
  };
}
