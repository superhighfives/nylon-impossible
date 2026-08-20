import type { ReactNode } from "react";

// Matches http(s) URLs up to the next whitespace. Captured so String.split keeps
// the URLs as odd-indexed segments alongside the surrounding text.
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
// Trailing punctuation that's almost never part of a URL — trimmed back into the
// surrounding text so a title like "see https://x.com/foo." doesn't link the ".".
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/**
 * Renders free text (e.g. a todo title) with any URLs turned into clickable
 * links. `stopPropagation` keeps a click on the link from bubbling to row-level
 * handlers, and links open in a new tab. Non-URL text renders verbatim.
 */
export function LinkifiedText({ text }: { text: string }): ReactNode {
  return text.split(URL_REGEX).map((segment, i) => {
    // Even indices are plain text; odd indices are the captured URLs.
    if (i % 2 === 0) return segment;
    const trailing = segment.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const href = trailing ? segment.slice(0, -trailing.length) : segment;
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
      <span key={`${i}:${segment}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline decoration-gray-line underline-offset-2 hover:decoration-gray break-all"
        >
          {href}
        </a>
        {trailing}
      </span>
    );
  });
}
