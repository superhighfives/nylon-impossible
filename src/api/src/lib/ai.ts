/**
 * AI-powered todo enrichment using Cloudflare AI Gateway
 *
 * This module ONLY extracts metadata from todo text:
 * - URLs/domains (removed from title, returned separately)
 * - Due dates from natural language
 * - Priority if mentioned
 *
 * It does NOT rephrase or rewrite the title - only cleans out URLs.
 */

export interface TodoEnrichment {
  title: string; // Original title with URLs removed
  urls?: string[];
  dueDate?: string; // ISO date string YYYY-MM-DD
  priority?: "high" | "low";
}

// Native Workers AI tool call format
interface WorkersAIToolCallResponse {
  response: string | null;
  tool_calls?: Array<{
    name: string;
    arguments: Record<string, unknown> | string;
  }>;
}

// OpenAI-compatible chat completions format (returned by some models via Workers AI)
interface OpenAICompatToolCallResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}

interface ParsedToolCall {
  name: string;
  arguments: TodoEnrichment;
}

const enrichTodoTool = {
  type: "function" as const,
  function: {
    name: "enrich_todo",
    description:
      "Extract metadata from a todo item. Find URLs/domains and remove them from the title. Extract due dates and priority. Do NOT rephrase or rewrite the title - only remove URLs from it.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "The original title with URLs/domains removed. Do NOT rephrase, reword, or change the meaning. Only remove the URL text. Example: 'Check out google.com tomorrow' becomes 'Check out tomorrow'",
        },
        urls: {
          type: "array",
          description:
            "Extract ANY website, domain, or URL mentioned. Be aggressive - if something looks like a domain (e.g., 'google.com', 'github.com/user', 'example.org'), extract it. Always add 'https://' prefix if missing.",
          items: {
            type: "string",
          },
        },
        dueDate: {
          type: "string",
          description:
            "Due date in ISO format (YYYY-MM-DD). Convert relative dates like 'tomorrow', 'next week', 'Friday' to absolute ISO dates based on today's date.",
        },
        priority: {
          type: "string",
          enum: ["high", "low"],
          description:
            "Extract priority if mentioned. Look for words like 'urgent', 'important', 'high priority', 'asap' (high) or 'low priority', 'whenever', 'not urgent' (low).",
        },
      },
      required: ["title"],
    },
  },
};

function getSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0];

  return `You are a metadata extractor for todo items. Today's date is: ${today}

Your ONLY job is to extract metadata from the user's text:
1. URLs/domains - find them and remove them from the title
2. Due dates - convert relative dates to ISO format
3. Priority - if mentioned

CRITICAL RULES:
- Do NOT rephrase, reword, or rewrite the title
- Do NOT change the meaning or intent of the title
- ONLY remove URLs/domains from the title text
- Keep everything else in the title exactly as written

Examples:
- "Hello google.com" → { title: "Hello", urls: ["https://google.com"] }
- "Check out https://example.com/page tomorrow" → { title: "Check out tomorrow", urls: ["https://example.com/page"], dueDate: "${today}" }
- "Buy milk" → { title: "Buy milk" } (no changes needed)
- "Urgent: call mom" → { title: "Urgent: call mom", priority: "high" }
- "github.com/user/repo review this" → { title: "review this", urls: ["https://github.com/user/repo"] }
- "Low priority fix the bug" → { title: "Low priority fix the bug", priority: "low" }
- "Meeting next Friday" → { title: "Meeting next Friday", dueDate: "[next Friday's date]" }

Always call the enrich_todo tool with your findings.`;
}

/**
 * Normalize a raw Workers AI response into a single tool call, handling both
 * the native Workers AI format (top-level tool_calls) and the OpenAI-compatible
 * chat completions format (choices[0].message.tool_calls).
 */
function extractToolCall(response: unknown): ParsedToolCall | null {
  // Native Workers AI format
  const native = response as WorkersAIToolCallResponse;
  if (native.tool_calls?.length) {
    const tc = native.tool_calls[0];
    return {
      name: tc.name,
      arguments: parseArguments(tc.arguments),
    };
  }

  // OpenAI-compatible chat completions format
  const openai = response as OpenAICompatToolCallResponse;
  const toolCalls = openai.choices?.[0]?.message?.tool_calls;
  if (toolCalls?.length) {
    const fn = toolCalls[0].function;
    if (!fn) return null;
    return {
      name: fn.name,
      arguments: parseArguments(fn.arguments),
    };
  }

  return null;
}

function parseArguments(
  args: Record<string, unknown> | string | unknown,
): ParsedToolCall["arguments"] {
  if (typeof args === "string") {
    return JSON.parse(args.trim());
  }
  return args as ParsedToolCall["arguments"];
}

/**
 * Enrich a todo with extracted metadata (URLs, due date, priority).
 * Does NOT rephrase the title - only removes URLs from it.
 */
export async function enrichTodo(
  ai: Ai,
  text: string,
): Promise<TodoEnrichment | null> {
  const systemPrompt = getSystemPrompt();

  // Model added recently, types not yet updated
  const response = await ai.run(
    "@cf/moonshotai/kimi-k2.5" as Parameters<typeof ai.run>[0],
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      tools: [enrichTodoTool],
      tool_choice: {
        type: "function",
        function: { name: "enrich_todo" },
      },
      max_tokens: 4000,
    },
    {
      gateway: {
        id: "nylon-impossible",
      },
    },
  );

  const tc = extractToolCall(response);

  if (!tc) {
    console.error("No tool call found in AI response");
    throw new Error("AI did not return enrichment");
  }

  if (tc.name !== "enrich_todo") {
    throw new Error(`Unexpected tool call: ${tc.name}`);
  }

  const enrichment = tc.arguments;

  // If nothing was extracted (no URLs, no date, no priority), return null
  const hasEnrichment =
    (enrichment.urls && enrichment.urls.length > 0) ||
    enrichment.dueDate ||
    enrichment.priority;

  if (!hasEnrichment && enrichment.title === text) {
    return null;
  }

  return enrichment;
}
