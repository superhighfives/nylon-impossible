/**
 * Server functions for AI-powered todo extraction
 *
 * Uses Workers AI via AI Gateway for observability and caching
 */

import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import OpenAI from "openai";
import {
  type AIToolCallResponse,
  type ExtractedTodo,
  type ExtractTodosInput,
  type ExtractTodosResult,
  extractTodosTool,
} from "@/lib/ai-types";
import {
  AIExtractionError,
  AIRateLimitError,
  AITimeoutError,
} from "@/lib/errors";

/**
 * Get the system prompt with today's date
 */
const getSystemPrompt =
  () => `You are a helpful assistant that extracts actionable todo items from text.

Guidelines:
- Extract only clear, actionable tasks (things the user needs to DO)
- Start each todo with an action verb (Buy, Call, Email, Review, etc.)
- Keep titles concise but specific (5-10 words ideal)
- Parse dates relative to today's date when mentioned (e.g., "by Friday", "next week", "tomorrow")
- If no deadline is mentioned, leave dueDate as null
- Don't create todos for general statements or observations
- Combine related items if they're clearly the same task
- Today's date is: ${new Date().toISOString().split("T")[0]}

Examples of good extractions:
- "need to buy milk" -> "Buy milk"
- "should email the team about the meeting" -> "Email team about meeting"
- "the report is due Friday" -> "Complete report" with dueDate set to this Friday`;

/**
 * Extract todos from natural language text using AI
 */
export const extractTodosFromText = createServerFn({ method: "POST" })
  .inputValidator((input: ExtractTodosInput) => {
    if (!input.text || input.text.trim().length === 0) {
      throw new Error("Text is required");
    }
    if (input.text.length > 10000) {
      throw new Error("Text is too long (max 10,000 characters)");
    }
    return input;
  })
  .handler(async (ctx): Promise<ExtractTodosResult> => {
    const { text } = ctx.data;

    // These should be set as secrets in wrangler
    const accountId = process.env.CF_ACCOUNT_ID;
    const gatewayName = process.env.AI_GATEWAY_NAME;
    const apiToken = process.env.CF_API_TOKEN;
    const model = process.env.AI_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8";

    if (!accountId || !gatewayName || !apiToken) {
      console.error("Missing AI Gateway configuration", {
        hasAccountId: !!accountId,
        hasGatewayName: !!gatewayName,
        hasApiToken: !!apiToken,
      });
      throw new Error("AI service not configured");
    }

    // Create OpenAI client pointing to AI Gateway
    const openai = new OpenAI({
      apiKey: apiToken,
      baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/compat`,
    });

    const program = Effect.gen(function* () {
      // Call AI Gateway with tool calling
      const response = yield* Effect.tryPromise({
        try: async () => {
          return await openai.chat.completions.create({
            model: `workers-ai/${model}`,
            messages: [
              { role: "system", content: getSystemPrompt() },
              { role: "user", content: text },
            ],
            tools: [extractTodosTool],
            tool_choice: {
              type: "function",
              function: { name: "extract_todos" },
            },
            max_tokens: 16000,
          });
        },
        catch: (error) => {
          // Handle specific error types
          if (error instanceof OpenAI.APIError) {
            if (error.status === 429) {
              const retryAfterHeader = error.headers?.["retry-after"];
              const retryAfter = retryAfterHeader
                ? Number.parseInt(retryAfterHeader, 10)
                : undefined;
              return new AIRateLimitError({
                message: "Too many requests. Please wait and try again.",
                ...(retryAfter !== undefined && { retryAfter }),
              });
            }
            if (error.status === 408 || error.code === "ETIMEDOUT") {
              return new AITimeoutError({
                message: "Request timed out. Please try again.",
              });
            }
          }
          return new AIExtractionError({
            message: "Failed to extract todos",
            cause: error,
          });
        },
      });

      // Extract tool call response
      const toolCall = response.choices[0]?.message?.tool_calls?.[0];

      if (
        !toolCall ||
        !("function" in toolCall) ||
        toolCall.function.name !== "extract_todos"
      ) {
        yield* Effect.log("No tool call in response", { response });
        return yield* Effect.fail(
          new AIExtractionError({
            message: "AI did not return extracted todos",
            cause: "Missing tool call in response",
          }),
        );
      }

      // Parse the tool call arguments
      const parsed = yield* Effect.try({
        try: () =>
          JSON.parse(toolCall.function.arguments) as AIToolCallResponse,
        catch: (error) =>
          new AIExtractionError({
            message: "Failed to parse AI response",
            cause: error,
          }),
      });

      // Transform to ExtractedTodo format with temp IDs
      const todos: ExtractedTodo[] = parsed.todos.map((todo, index) => ({
        title: todo.title,
        dueDate: todo.dueDate ?? null,
        tempId: `extracted-${Date.now()}-${index}`,
        selected: true,
      }));

      yield* Effect.log(`Extracted ${todos.length} todos from text`);

      return { todos };
    });

    // Run the Effect and handle errors
    try {
      return await Effect.runPromise(program);
    } catch (error) {
      // Log and rethrow for the client to handle
      console.error("AI extraction error:", error);

      // Convert Effect error to user-friendly error
      if (typeof error === "object" && error !== null && "_tag" in error) {
        const taggedError = error as { _tag: string; message?: string };
        switch (taggedError._tag) {
          case "AIRateLimitError":
            throw new Error("Too many requests. Please wait and try again.");
          case "AITimeoutError":
            throw new Error("Request timed out. Please try again.");
          case "AIExtractionError":
            throw new Error(taggedError.message || "Failed to extract todos");
        }
      }

      throw new Error("Failed to extract todos. Please try again.");
    }
  });
