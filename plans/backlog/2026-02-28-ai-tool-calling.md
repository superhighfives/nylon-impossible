# AI Tool Calling Not Working with Qwen Model

## Problem

The smart create endpoint (`POST /todos/smart`) calls Workers AI with the `@cf/qwen/qwen3-30b-a3b-fp8` model using tool calling, but the model's response doesn't contain extractable tool calls. The response shows `finish_reason: 'tool_calls'` but the parsing in `ai.ts` fails with "AI did not return extracted todos", falling back to creating a single todo with the raw input.

## Log Output

```
No tool call in AI response {
  model: '@cf/qwen/qwen3-30b-a3b-fp8',
  choices: [{ finish_reason: 'tool_calls', message: [Object] }],
  usage: { prompt_tokens: 390, completion_tokens: 501, total_tokens: 891 }
}
AI extraction failed, falling back to single todo: Error: AI did not return extracted todos
```

## Investigation Needed

- Check if `@cf/qwen/qwen3-30b-a3b-fp8` properly supports tool calling via Workers AI
- Review available models on Cloudflare AI Gateway that support tool use
- Check if the response format differs from what `ai.ts` expects (e.g. OpenAI-style vs Workers AI native format)
- Consider whether the tool call is in `message.tool_calls` or a different field

## Relevant Files

- `src/api/src/lib/ai.ts` — AI extraction logic and response parsing
- `src/api/src/handlers/smart-create.ts` — smart create handler with fallback
