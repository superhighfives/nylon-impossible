# AI-Powered Todo Extraction

**Date**: 2026-02-10
**Status**: Complete

## Overview

Extract todos from natural language text using Workers AI with tool calling, routed through AI Gateway for observability and caching.

## Architecture

```
User Input → TanStack Start Server Function → AI Gateway → Workers AI (Qwen3-30b) → Tool Call Response
                                                                    ↓
                                                            extract_todos tool
                                                            returns structured data
                                                                    ↓
                                            User Reviews → Confirm → Create todos via existing server functions
```

### Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model | `@cf/qwen/qwen3-30b-a3b-fp8` (configurable via `AI_MODEL` env var) | Public model, 32k context, supports tool calling |
| Routing | AI Gateway `/compat` endpoint | Caching, rate limiting, observability, easy model swapping |
| SDK | OpenAI SDK (`openai` package) | AI Gateway compat endpoint is OpenAI-compatible |
| Extraction | Tool calling with `extract_todos` function | Structured output, reliable JSON schema |
| Error handling | Effect with tagged errors | Type-safe, composable with existing server function patterns |

## Implementation

### Files

| File | Purpose |
|------|---------|
| `src/web/src/server/ai.ts` | `extractTodosFromText` server function using Effect |
| `src/web/src/lib/ai-types.ts` | Types, tool definition, and interfaces |
| `src/web/src/components/TodoPreview.tsx` | Preview extracted todos before adding |
| `src/web/src/components/TodoInput.tsx` | Modified to trigger AI extraction |
| `src/web/src/lib/errors.ts` | `AIExtractionError`, `AIRateLimitError`, `AITimeoutError` |

### Server function

`extractTodosFromText` in `src/web/src/server/ai.ts`:

- Creates OpenAI client pointing to AI Gateway (`gateway.ai.cloudflare.com/v1/{accountId}/{gatewayName}/compat`)
- Uses `tool_choice` to force the `extract_todos` function call
- System prompt includes today's date for relative date parsing ("by Friday", "tomorrow")
- Input validation: non-empty, max 10,000 characters
- Wrapped in Effect for type-safe error handling
- Errors converted to user-friendly messages at the boundary

### Tool definition

`extract_todos` tool in `src/web/src/lib/ai-types.ts`:

```typescript
{
  name: "extract_todos",
  parameters: {
    todos: [{
      title: string,    // Concise action item starting with a verb
      dueDate?: string  // ISO 8601 date (YYYY-MM-DD) if deadline mentioned
    }]
  }
}
```

### Output types

```typescript
interface ExtractedTodo {
  title: string;
  dueDate: string | null;
  tempId: string;       // For preview UI tracking (e.g., "extracted-1708000000-0")
  selected: boolean;    // User toggles in preview
}
```

### Error handling

| Error | Trigger | User message |
|-------|---------|--------------|
| `AIExtractionError` | Model failed, no tool call, parse failure | "Couldn't extract todos. Try rephrasing." |
| `AIRateLimitError` | 429 from AI Gateway | "Too many requests. Please wait." |
| `AITimeoutError` | 408 or `ETIMEDOUT` | "Request timed out. Try again." |

### Preview UX

`TodoPreview` component shows extracted todos with:
- Editable title per todo
- Due date picker (if date was detected)
- Checkbox to include/exclude each todo
- Select/deselect all
- "Add X todos" confirmation button
- Creation status feedback

### Environment variables

| Variable | Purpose |
|----------|---------|
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `AI_GATEWAY_NAME` | Name of AI Gateway |
| `CF_API_TOKEN` | API token with Workers AI permission |
| `AI_MODEL` | Optional model override (default: `@cf/qwen/qwen3-30b-a3b-fp8`) |

## Out of scope

- Speech-to-text input
- Priority extraction
- Category/tag extraction
