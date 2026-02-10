# AI-Powered Todo Extraction

**Date**: 2026-02-10  
**Status**: In Progress

## Overview

Add the ability to extract todos from natural language text using Workers AI with tool calling, routed through AI Gateway for observability and caching.

## User story

As a user, I want to paste or dictate freeform text (meeting notes, brain dumps, quick lists) and have the app automatically extract actionable todo items with optional due dates.

## Architecture

```
User Input → Cloudflare Worker → AI Gateway → Workers AI (Qwen3-30b) → Tool Call Response
                                                      ↓
                                              extract_todos tool
                                              returns structured data
                                                      ↓
                              User Reviews → Confirm → Create todos via existing server functions
```

### Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model | `@cf/qwen/qwen3-30b-a3b-fp8` | Public model, 32k context, supports tool calling |
| Routing | AI Gateway `/compat` endpoint | Caching, rate limiting, observability, easy model swapping |
| SDK | OpenAI SDK | AI Gateway compat endpoint is OpenAI-compatible |
| Extraction | Tool calling | Structured output, reliable JSON schema |

### Why AI Gateway over direct binding?

- Request/response logging for debugging
- Caching for repeated extractions
- Rate limiting protects against abuse
- Model-agnostic - easy to upgrade to Kimi K2.5 or GLM-4.7-Flash later

## Data flow

### 1. Extraction request

```typescript
// Client triggers extraction
const { todos } = await extractTodosFromText({ text: userInput });

// Server function calls AI Gateway
const response = await openai.chat.completions.create({
  model: "workers-ai/@cf/qwen/qwen3-30b-a3b-fp8",
  messages: [{ role: "user", content: text }],
  tools: [extractTodosTool],
  max_tokens: 16000,
});
```

### 2. Tool definition

```typescript
const extractTodosTool = {
  name: "extract_todos",
  description: "Extract actionable todo items from text. Each todo should be a clear, concise action item.",
  parameters: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { 
              type: "string", 
              description: "Concise action item (e.g., 'Buy groceries', 'Email team about Friday meeting')" 
            },
            dueDate: { 
              type: "string", 
              description: "ISO 8601 date if a deadline is mentioned (e.g., '2026-02-15'), null otherwise" 
            }
          },
          required: ["title"]
        }
      }
    },
    required: ["todos"]
  }
};
```

### 3. Response handling

AI responds with `tool_calls`:

```json
{
  "tool_calls": [{
    "name": "extract_todos",
    "arguments": {
      "todos": [
        { "title": "Buy groceries", "dueDate": null },
        { "title": "Email team about Friday meeting", "dueDate": "2026-02-14" }
      ]
    }
  }]
}
```

### 4. Preview and confirmation

Frontend displays extracted todos for user review before creating them via existing `createTodo` server function.

## Frontend UX

### Smart input detection

- **Short input** (< 50 chars, no commas/periods): Treat as quick add (existing behavior)
- **Longer input**: Show "Extract todos" button

### Extraction states

| State | UI |
|-------|-----|
| `idle` | Normal input field |
| `extracting` | Loading spinner, input disabled |
| `preview` | List of extracted todos as editable cards |
| `creating` | Adding confirmed todos |

### Preview component

Each extracted todo shows:
- Editable title
- Due date picker (if date was detected)
- Checkbox to include/exclude
- Delete button

Confirmation bar shows "Add X todos" button.

## Implementation

### Files to create

| File | Purpose |
|------|---------|
| `src/server/ai.ts` | AI extraction server function with Effect |
| `src/lib/ai-types.ts` | Types for extracted todos |
| `src/components/TodoPreview.tsx` | Preview extracted todos before adding |

### Files to modify

| File | Changes |
|------|---------|
| `src/components/TodoInput.tsx` | Add AI extraction trigger and state management |
| `wrangler.jsonc` | Add AI Gateway binding |
| `worker-configuration.d.ts` | Regenerate with new env vars |

### Dependencies

```bash
npm install openai
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `AI_GATEWAY_NAME` | Name of AI Gateway (created in dashboard) |
| `CF_API_TOKEN` | API token with Workers AI permission |

## Error handling

Using Effect for type-safe errors:

| Error | Cause | User message |
|-------|-------|--------------|
| `AIExtractionError` | Model failed to extract | "Couldn't extract todos. Try rephrasing." |
| `AIRateLimitError` | 429 from AI Gateway | "Too many requests. Please wait." |
| `AITimeoutError` | Request timeout | "Request timed out. Try again." |

Implement retry with exponential backoff for 3040 (OutOfCapacity) errors.

## Future enhancements

- [ ] Speech-to-text input (Web Speech API or Whisper)
- [ ] Priority extraction when schema supports it
- [ ] Category/tag extraction
- [ ] Upgrade to Kimi K2.5 or GLM-4.7-Flash for better extraction

## Testing

- Unit tests for tool response parsing
- Integration test with mocked AI Gateway response
- Manual testing with various input types:
  - Comma-separated lists
  - Natural language paragraphs
  - Meeting notes with dates
  - Mixed format brain dumps

## Setup checklist

1. [ ] Create AI Gateway in Cloudflare dashboard
2. [ ] Add environment variables to wrangler.jsonc
3. [ ] Generate CF API token with Workers AI access
4. [ ] Run `wrangler types` to update worker-configuration.d.ts
