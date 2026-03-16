# Smart create URL handling and test coverage

**Date**: 2026-03-16
**Status**: Done

## Problem

When a long URL (>500 characters) is shared to the iOS app, the user gets a 400 error with no clear feedback. This happens because:

1. The URL triggers the AI path via `shouldUseAI()` detecting URLs
2. If AI fails or returns empty, the fallback creates a todo with `title: text` (the raw URL)
3. The 500-character title limit validation fails, returning 400

Example failing URL (2,100 chars):
```
https://www.google.com/search?client=safari&hs=6XrU&sa=X&sca_esv=57908ecadfb13611...
```

Additionally, there are no integration tests for the `/todos/smart` endpoint or AI-powered todo extraction.

## Solution

Two-part fix:

1. **Smart fallback for URLs**: When AI fails/returns empty and the input contains a URL, create a truncated title like "Check [domain]" and store the full URL in `todoUrls`. Also add a safety net to truncate any title that exceeds 500 chars.

2. **Test coverage**: Add integration tests with mocked AI for CI, plus an optional test file that calls real AI (gated behind an env var).

## Implementation

### Part 1: Fix URL handling in smart create

#### New file: `src/api/src/lib/url-helpers.ts`

Create a utility module with:

```typescript
/**
 * Extract domain from a URL string.
 * Returns null if the URL is invalid.
 */
export function extractDomain(urlString: string): string | null

/**
 * Create a fallback todo from a URL when AI fails.
 * Returns a title like "Check example.com" and the cleaned URL.
 */
export function createFallbackFromUrl(urlString: string): {
  title: string;
  url: string;
} | null

/**
 * Truncate a title to fit within the 500-char limit.
 * Adds ellipsis if truncated.
 */
export function truncateTitle(title: string, maxLength = 500): string
```

Key behaviors:
- `extractDomain` strips `www.` prefix and handles edge cases
- `createFallbackFromUrl` generates action-oriented titles: "Check [domain]"
- `truncateTitle` truncates at word boundaries when possible, adds "..." suffix

#### Modify: `src/api/src/handlers/smart-create.ts`

1. Import the new helpers

2. Update fallback paths (lines 69, 74, 81) to detect URLs:
   ```typescript
   // Before
   return createAndReturn(db, c, userId, [{ title: text }], firstPosition);
   
   // After
   const fallbackItem = createFallbackItem(text);
   return createAndReturn(db, c, userId, [fallbackItem], firstPosition);
   ```

3. Add `createFallbackItem()` helper:
   ```typescript
   function createFallbackItem(text: string): ExtractedItem {
     // Check if input is primarily a URL
     const urlMatch = text.match(URL_REGEX);
     if (urlMatch && urlMatch[0].length > text.length * 0.8) {
       const fallback = createFallbackFromUrl(urlMatch[0]);
       if (fallback) {
         return { title: fallback.title, urls: [fallback.url] };
       }
     }
     // Regular fallback - truncate if needed
     return { title: truncateTitle(text) };
   }
   ```

4. Add safety truncation in `createAndReturn()` before inserting:
   ```typescript
   const rows = itemsWithUrls.map((item, i) => {
     const id = crypto.randomUUID();
     ids.push(id);
     return {
       id,
       userId,
       title: truncateTitle(item.title), // Safety truncation
       // ...rest
     };
   });
   ```

### Part 2: Create AI mock

#### New file: `src/api/test/__mocks__/ai.ts`

```typescript
import { vi } from "vitest";

export interface MockAIResponse {
  tool_calls?: Array<{
    name: string;
    arguments: string | object;
  }>;
}

export const mockAI = {
  run: vi.fn<[string, object, object?], Promise<MockAIResponse>>(),
};

export function mockAIExtraction(todos: Array<{ title: string; urls?: string[]; dueDate?: string }>) {
  mockAI.run.mockResolvedValueOnce({
    tool_calls: [{
      name: "extract_todos",
      arguments: { todos },
    }],
  });
}

export function mockAIFailure(error: Error) {
  mockAI.run.mockRejectedValueOnce(error);
}

export function mockAIEmpty() {
  mockAI.run.mockResolvedValueOnce({
    tool_calls: [{
      name: "extract_todos",
      arguments: { todos: [] },
    }],
  });
}
```

### Part 3: Integration tests for smart create

#### New file: `src/api/test/integration/smart-create.test.ts`

Test cases:

**Fast path (no AI):**
- Simple text creates single todo
- Short text (<120 chars, no patterns) bypasses AI

**AI path (mocked):**
- Multi-line text triggers AI, creates multiple todos
- Text with "and" triggers AI
- AI extracts URLs into todoUrls table
- AI failure falls back gracefully to single todo

**URL handling:**
- Short URL input creates todo with URL extracted
- Very long URL (>500 chars) creates truncated title + stores full URL
- URL with complex query params is preserved in todoUrls
- Multiple URLs in text are all extracted

**Validation:**
- Empty input returns 400
- Whitespace-only input returns 400
- Input at exactly 10,000 chars succeeds
- Input at 10,001 chars returns 400

**Edge cases:**
- Unicode in text is handled correctly
- Title at exactly 500 chars is not truncated
- Title at 501 chars is truncated to 497 + "..."

### Part 4: Unit tests for URL helpers

#### New file: `src/api/test/unit/url-helpers.test.ts`

Test `extractDomain()`:
- `https://example.com/path` -> `example.com`
- `https://www.example.com` -> `example.com`
- `http://sub.example.co.uk/page` -> `sub.example.co.uk`
- `not-a-url` -> `null`
- Empty string -> `null`

Test `createFallbackFromUrl()`:
- Returns `{ title: "Check example.com", url: "https://example.com/..." }`
- Handles URLs with/without trailing slash
- Returns null for invalid URLs
- Preserves full URL including query params

Test `truncateTitle()`:
- Text under 500 chars unchanged
- Text at 500 chars unchanged
- Text at 501 chars truncated to "...text..." (497 chars + "...")
- Truncates at word boundary when possible
- Handles single very long word

### Part 5: Optional real AI tests

#### New file: `src/api/test/integration/smart-create-ai.test.ts`

```typescript
import { describe, it, expect } from "vitest";

const RUN_AI_TESTS = process.env.RUN_AI_TESTS === "true";

describe.skipIf(!RUN_AI_TESTS)("Smart create with real AI", () => {
  // Tests that actually call Workers AI
});
```

Test cases (when enabled):
- Extract todos from natural language: "buy milk and call mom"
- Extract URL and create clean title from shared link
- Convert relative date "tomorrow" to ISO date
- Handle mixed actionable/non-actionable: "random stuff, also call dentist"
- Handle list format: "1. first 2. second 3. third"

### Files summary

| File | Action |
|------|--------|
| `src/api/src/lib/url-helpers.ts` | Create |
| `src/api/src/handlers/smart-create.ts` | Modify |
| `src/api/test/__mocks__/ai.ts` | Create |
| `src/api/test/integration/smart-create.test.ts` | Create |
| `src/api/test/unit/url-helpers.test.ts` | Create |
| `src/api/test/integration/smart-create-ai.test.ts` | Create |

## Acceptance criteria

- [ ] Long URLs (>500 chars) create todos successfully with truncated titles
- [ ] Full URLs are preserved in the `todoUrls` table
- [ ] AI mock allows testing smart create without real AI calls
- [ ] All new tests pass in CI (`pnpm api:test`)
- [ ] Existing tests continue to pass
- [ ] Optional real AI tests can be run with `RUN_AI_TESTS=true pnpm api:test`

## Test coverage matrix

| Scenario | Before | After |
|----------|--------|-------|
| Title >500 chars via POST /todos | Yes | Yes |
| Title exactly 500 chars | No | Yes |
| Smart create fast path | No | Yes |
| Smart create AI path (mocked) | No | Yes |
| Very long URL handling | No | Yes |
| URL extraction to todoUrls | No | Yes |
| AI failure fallback | No | Yes |
| Unicode input | No | Yes |
| Real AI extraction | No | Yes (optional) |

## Dependencies

- None - this is a standalone improvement

## Notes

- The AI mock should be flexible enough to test both Workers AI native format and OpenAI-compatible format (the current `ai.ts` handles both)
- Real AI tests are opt-in to avoid costs and flakiness in CI
- Consider adding a user-facing error message in the iOS app for validation failures (separate work)
