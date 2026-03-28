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
  research?: {
    type: "general" | "location";
  };
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
        research: {
          type: "object",
          description:
            "Set when the todo has research intent - questions, comparisons, 'look up', 'how to', venue/place references. Do NOT set for plain action items ('buy milk', 'call mom').",
          properties: {
            type: {
              type: "string",
              enum: ["general", "location"],
              description:
                "'location' for venue/place todos (restaurants, bars, cafes, shops, specific addresses). 'general' for everything else (questions, comparisons, how-to, research topics).",
            },
          },
          required: ["type"],
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
4. Research intent - questions, comparisons, "look up", "how to", venue references

CRITICAL RULES:
- Do NOT rephrase, reword, or rewrite the title
- Do NOT change the meaning or intent of the title
- ONLY remove URLs/domains from the title text
- Keep everything else in the title exactly as written

RESEARCH DETECTION:
- Set research.type = "general" for questions, comparisons, "look up", "how to", research topics
- Set research.type = "location" for venue/place todos (restaurants, bars, cafes, shops, addresses)
- Do NOT set research for plain action items (buy, call, email, fix, etc.)

Examples:
- "Hello google.com" → { title: "Hello", urls: ["https://google.com"] }
- "Check out https://example.com/page tomorrow" → { title: "Check out tomorrow", urls: ["https://example.com/page"], dueDate: "${today}" }
- "Buy milk" → { title: "Buy milk" } (no research - plain action)
- "Urgent: call mom" → { title: "Urgent: call mom", priority: "high" } (no research - plain action)
- "github.com/user/repo review this" → { title: "review this", urls: ["https://github.com/user/repo"] }
- "Low priority fix the bug" → { title: "Low priority fix the bug", priority: "low" } (no research - plain action)
- "Meeting next Friday" → { title: "Meeting next Friday", dueDate: "[next Friday's date]" }
- "Dogs ages vs human ages" → { title: "Dogs ages vs human ages", research: { type: "general" } }
- "How does OAuth work" → { title: "How does OAuth work", research: { type: "general" } }
- "Best practices for React Server Components" → { title: "Best practices for React Server Components", research: { type: "general" } }
- "Look up white chocolate recipe" → { title: "Look up white chocolate recipe", research: { type: "general" } }
- "Book dinner at San Jalisco" → { title: "Book dinner at San Jalisco", research: { type: "location" } }
- "Drinks at The Rusty Nail" → { title: "Drinks at The Rusty Nail", research: { type: "location" } }
- "Check out that new ramen place on Main St" → { title: "Check out that new ramen place on Main St", research: { type: "location" } }

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

const ENRICH_TIMEOUT_MS = 30_000;

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Enrichment timed out")), timeoutMs);
  });
  return Promise.race([promise, timeout]);
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
  const response = await runWithTimeout(
    ai.run(
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
    ),
    ENRICH_TIMEOUT_MS,
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

  // If nothing was extracted (no URLs, no date, no priority, no research), return null
  const hasEnrichment =
    (enrichment.urls && enrichment.urls.length > 0) ||
    enrichment.dueDate ||
    enrichment.priority ||
    enrichment.research;

  if (!hasEnrichment && enrichment.title === text) {
    return null;
  }

  return enrichment;
}
