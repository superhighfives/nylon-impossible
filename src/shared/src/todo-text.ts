/** Longest title the API accepts (`createTodoSchema` / `updateTodoSchema`). */
export const TODO_TITLE_MAX = 500;

/** Longest notes the API accepts. */
export const TODO_NOTES_MAX = 10000;

/**
 * Target length for a title cut from overflowing text. Deliberately well under
 * `TODO_TITLE_MAX`: a 500-char title is unreadable as a row, and the full text
 * is kept in notes anyway.
 */
const OVERFLOW_TITLE_LENGTH = 120;

const URL_ONLY = /^https?:\/\/\S+$/i;

/**
 * Cut `text` to at most `max` code points, preferring the last word boundary,
 * and append an ellipsis. Splits by code point so surrogate pairs survive.
 */
function clip(text: string, max: number): string {
  const codePoints = Array.from(text);
  if (codePoints.length <= max) return text;
  const head = codePoints.slice(0, max - 1).join("");
  const lastSpace = head.lastIndexOf(" ");
  // Only back up to a word boundary when it doesn't throw away most of the cut.
  const cut = lastSpace > max * 0.6 ? head.slice(0, lastSpace) : head;
  return `${cut.trimEnd()}…`;
}

/**
 * Split free-form input into a title that fits and notes that keep the rest.
 *
 * - Short single-line text passes through untouched.
 * - Multi-line text whose first line fits: that line is the title, the
 *   remaining lines become notes.
 * - Anything else over `TODO_TITLE_MAX`: a clipped title with the full original
 *   text in notes, so pasting a long document never fails validation or
 *   silently loses content. A bare URL is titled with its hostname.
 */
export function splitTodoText(text: string): {
  title: string;
  notes: string | null;
} {
  const trimmed = text.trim();
  const newline = trimmed.indexOf("\n");
  if (newline === -1 && trimmed.length <= TODO_TITLE_MAX) {
    return { title: trimmed, notes: null };
  }

  if (newline !== -1) {
    const firstLine = trimmed.slice(0, newline).trim();
    const rest = trimmed.slice(newline + 1).trim();
    if (firstLine && firstLine.length <= TODO_TITLE_MAX) {
      return { title: firstLine, notes: rest ? capNotes(rest) : null };
    }
  }

  const notes = capNotes(trimmed);

  if (URL_ONLY.test(trimmed)) {
    try {
      return { title: new URL(trimmed).hostname, notes };
    } catch {
      // Not parseable — fall through to the plain-text split.
    }
  }

  const firstLine =
    trimmed
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? trimmed;
  return { title: clip(firstLine, OVERFLOW_TITLE_LENGTH), notes };
}

function capNotes(text: string): string {
  return Array.from(text).slice(0, TODO_NOTES_MAX).join("");
}
