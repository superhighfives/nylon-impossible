/**
 * Heuristic detection for multi-item input
 *
 * Routes text to AI if it likely contains multiple todos.
 * Simple, single-item text goes through the fast path.
 */

// List-like patterns
const LIST_PATTERNS = /^[\s]*(\d+[.)]\s|[-*]\s)/m;

// "and" joining clauses (e.g. "buy milk and email the team")
const AND_CLAUSES = /,?\s+and\s+[a-z]/i;

// Comma followed by what looks like a new action
const COMMA_CLAUSE = /,\s+[a-z]/;

/**
 * Determine whether input text should be routed through AI extraction.
 *
 * Returns true if the text likely contains multiple items.
 */
export function shouldUseAI(text: string): boolean {
  // Contains newlines (likely multi-item)
  if (text.includes("\n")) return true;

  // Contains list-like patterns (1. / 2. / - / *)
  if (LIST_PATTERNS.test(text)) return true;

  // Long text is more likely to be multi-item
  if (text.length > 120) return true;

  // Contains "and" joining what look like separate clauses
  if (AND_CLAUSES.test(text)) return true;

  // Contains comma followed by lowercase (likely separate items)
  if (COMMA_CLAUSE.test(text)) return true;

  return false;
}
