# AI Tool Calling

**Date**: 2026-02-28
**Status**: Complete

## Overview

Implemented AI-powered smart task creation that extracts structured todos from natural language input. The system uses Workers AI with tool calling to parse user input and create one or more todos automatically.

Originally attempted with `@cf/qwen/qwen3-30b-a3b-fp8` but the model had inconsistent tool calling support. Switched to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` which provides reliable tool use.

## Architecture

### Key decisions

- **Model selection**: Used Llama 3.3 70B for reliable tool calling instead of Qwen
- **Fallback strategy**: If AI extraction fails, falls back to creating a single todo with the raw input
- **Structured output**: AI returns structured data via tool calls that map directly to todo creation parameters

## Files

| File | Purpose |
|------|---------|
| `src/api/src/lib/ai.ts` | AI client, tool calling logic, and response parsing |
| `src/api/src/handlers/smart-create.ts` | HTTP handler for smart create endpoint with fallback logic |

## Key patterns

```typescript
// Tool definition for extracting todos from natural language
const extractTodosTool = {
  type: 'function' as const,
  function: {
    name: 'extract_todos',
    description: 'Extract one or more todos from the user input',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              list: { type: 'string' }
            },
            required: ['content']
          }
        }
      },
      required: ['todos']
    }
  }
};

// Response parsing with fallback
const extractTodosFromResponse = (response: any): TodoInput[] => {
  // Check for tool calls in response
  if (response.choices?.[0]?.message?.tool_calls) {
    const toolCall = response.choices[0].message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);
    return args.todos;
  }
  throw new Error('AI did not return extracted todos');
};
```

## Dependencies

```json
{
  "@cloudflare/workers-types": "^4.x"
}
```

## API Endpoint

`POST /todos/smart`

Request body:
```json
{
  "input": "Remind me to buy milk and call mom tomorrow"
}
```

Response: Array of created todo objects
