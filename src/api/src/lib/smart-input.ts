/**
 * Heuristic detection for multi-item or date-containing input
 *
 * Routes text to AI if it likely contains multiple todos or relative dates.
 * Simple, single-item text without dates goes through the fast path.
 */

// Relative date patterns that need AI to resolve
const DATE_PATTERNS =
  /\b(tomorrow|yesterday|today|tonight|next\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|end\s+of|next)|due\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|by|on|next|tomorrow|today)|in\s+\d+\s+(days?|weeks?|months?))\b/i;

// List-like patterns
const LIST_PATTERNS = /^[\s]*(\d+[.)]\s|[-*]\s)/m;

// "and" joining clauses (e.g. "buy milk and email the team")
const AND_CLAUSES = /,?\s+and\s+[a-z]/i;

// Comma followed by what looks like a new action
const COMMA_CLAUSE = /,\s+[a-z]/;

/**
 * Determine whether input text should be routed through AI extraction.
 *
 * Returns true if the text likely contains multiple items or relative dates.
 */
export function shouldUseAI(text: string): boolean {
  // Contains newlines (likely multi-item)
  if (text.includes("\n")) return true;

  // Contains list-like patterns (1. / 2. / - / *)
  if (LIST_PATTERNS.test(text)) return true;

  // Long text is more likely to be multi-item
  if (text.length > 120) return true;

  // Contains relative date references that AI should parse
  if (DATE_PATTERNS.test(text)) return true;

  // Contains "and" joining what look like separate clauses
  if (AND_CLAUSES.test(text)) return true;

  // Contains comma followed by lowercase (likely separate items)
  if (COMMA_CLAUSE.test(text)) return true;

  return false;
}
