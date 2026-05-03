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
            "Extract URLs and domains that LITERALLY appear in the user's text. A domain or URL must match a sequence of characters in the input (e.g., 'google.com', 'github.com/user', 'example.org'). Never invent, guess, or fabricate URLs based on the topic — if the text is about a concept (e.g., 'back pain remedies') but contains no URL, return an empty array. Always add 'https://' prefix if missing.",
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
- Exception: when removing a URL/domain leaves ONLY a single generic word (e.g. "Research", "Check", "Look"), keep the domain name in the title (e.g. "Research https://google.com" → title: "Research google.com")
- NEVER invent, guess, or fabricate URLs based on the topic. Only return URLs that literally appear in the user's text. If the text describes a concept without mentioning a URL (e.g. "Research back pain remedies", "Look up white chocolate recipe"), the urls array MUST be empty.

RESEARCH DETECTION:
- Set research.type = "general" for questions, comparisons, "look up", "how to", research topics
- Set research.type = "location" for venue/place todos (restaurants, bars, cafes, shops, addresses)
- Do NOT set research for plain action items (buy, call, email, fix, etc.)

Examples:
- "Hello google.com" → { title: "Hello", urls: ["https://google.com"] }
- "Research https://google.com" → { title: "Research google.com", urls: ["https://google.com"] }
- "Check out https://example.com/page tomorrow" → { title: "Check out tomorrow", urls: ["https://example.com/page"], dueDate: "${today}" }
- "Buy milk" → { title: "Buy milk" } (no research - plain action)
- "Urgent: call mom" → { title: "Urgent: call mom", priority: "high" } (no research - plain action)
- "github.com/user/repo review this" → { title: "review this", urls: ["https://github.com/user/repo"] }
- "Low priority fix the bug" → { title: "Low priority fix the bug", priority: "low" } (no research - plain action)
- "Meeting next Friday" → { title: "Meeting next Friday", dueDate: "[next Friday's date]" }
- "Dogs ages vs human ages" → { title: "Dogs ages vs human ages", research: { type: "general" } }
- "How does OAuth work" → { title: "How does OAuth work", research: { type: "general" } }
- "Best practices for React Server Components" → { title: "Best practices for React Server Components", research: { type: "general" } }
- "Look up white chocolate recipe" → { title: "Look up white chocolate recipe", research: { type: "general" } } (no urls — topic only, no URL in text)
- "Research back pain remedies" → { title: "Research back pain remedies", research: { type: "general" } } (no urls — do NOT invent domains like "backpainremedies.com")
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

// Summarize the top-level shape of a Workers AI response for diagnostics —
// keys only, no user content, so it's safe to log and include in error
// messages. Helps identify when a model returns a different envelope than
// expected (e.g. a new model that doesn't speak the tool-call protocol).
function describeResponseShape(response: unknown): string {
  if (response === null || response === undefined) return String(response);
  if (typeof response !== "object") return typeof response;
  const keys = Object.keys(response as Record<string, unknown>);
  const obj = response as Record<string, unknown>;
  const hints: string[] = [];
  if (typeof obj.response === "string") hints.push("response:string");
  if (Array.isArray(obj.tool_calls))
    hints.push(`tool_calls:${obj.tool_calls.length}`);
  if (Array.isArray(obj.choices)) hints.push(`choices:${obj.choices.length}`);
  return `{${keys.join(",")}}${hints.length ? ` (${hints.join(",")})` : ""}`;
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

/**
 * Verify that a URL extracted by the LLM actually corresponds to something
 * the user mentioned. Defensive filter against hallucinations — even with
 * strict prompting, the model sometimes invents domains from a topic
 * (e.g., "Research back pain remedies" → "backpainremedies.com").
 *
 * A URL is considered mentioned if its hostname (with an optional "www."
 * prefix stripped) appears as a substring of the input text, case-insensitive.
 * This correctly accepts URLs the user typed (e.g., "Hello google.com"
 * where hostname "google.com" appears literally) while rejecting invented
 * domains (e.g., "backpainremedies.com" never appears in "Research back
 * pain remedies" because of the spaces).
 */
export function urlMentionedInText(url: string, text: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  // Reject dotless hostnames like "https://dogs" — the model invented a
  // domain from a single word in the input. Real public URLs always have
  // a TLD separator.
  if (!hostname.includes(".")) return false;
  const lowerText = text.toLowerCase();
  if (lowerText.includes(hostname)) return true;
  // Also accept the bare domain without the www. prefix (user may have
  // typed "example.com" even though the LLM returned "www.example.com").
  const bare = hostname.replace(/^www\./, "");
  return bare !== hostname && lowerText.includes(bare);
}

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Enrichment timed out")),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Enrich a todo with extracted metadata (URLs, due date, priority).
 * Does NOT rephrase the title - only removes URLs from it.
 */
export async function enrichTodo(
  ai: Ai,
  text: string,
  gatewayId?: string,
  debug = false,
): Promise<TodoEnrichment | null> {
  const systemPrompt = getSystemPrompt();

  const response = await runWithTimeout(
    ai.run(
      "@cf/moonshotai/kimi-k2.5",
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
      gatewayId ? { gateway: { id: gatewayId } } : {},
    ),
    ENRICH_TIMEOUT_MS,
  );

  const tc = extractToolCall(response);

  if (!tc) {
    const shape = describeResponseShape(response);
    console.error("No tool call found in AI response", shape);
    throw new Error(`AI did not return enrichment (shape: ${shape})`);
  }

  if (tc.name !== "enrich_todo") {
    throw new Error(`Unexpected tool call: ${tc.name}`);
  }

  const enrichment = tc.arguments;

  // Diagnostic for unfamiliar models: report which fields the model populated.
  // PII-free (keys and booleans only). Off by default; opt in with LOG_AI_DEBUG.
  if (debug) {
    console.log("AI enrichment returned", {
      keys: Object.keys(enrichment ?? {}),
      hasUrls: Array.isArray(enrichment?.urls) && enrichment.urls.length > 0,
      hasDueDate: Boolean(enrichment?.dueDate),
      hasPriority: Boolean(enrichment?.priority),
      hasResearch: Boolean(enrichment?.research),
      titleChanged: enrichment?.title !== text,
    });
  }

  // Defensive filter: drop URLs the model invented from the topic. Even with
  // the prompt telling it not to fabricate, the model sometimes guesses
  // domains that aren't in the input (e.g., "Research back pain remedies"
  // → "backpainremedies.com"). Keep only URLs whose hostname is mentioned.
  if (Array.isArray(enrichment.urls) && enrichment.urls.length > 0) {
    const originalCount = enrichment.urls.length;
    enrichment.urls = enrichment.urls.filter(
      (url): url is string =>
        typeof url === "string" && urlMentionedInText(url, text),
    );
    const droppedAll = enrichment.urls.length === 0;
    if (droppedAll) {
      delete enrichment.urls;
    }
    // If all extracted URLs were hallucinated, the model may also have
    // "cleaned" them out of the title — restore the original text so we
    // don't end up with a truncated title (e.g. "Research" from
    // "Research back pain remedies").
    if (
      droppedAll &&
      originalCount > 0 &&
      enrichment.title &&
      enrichment.title !== text
    ) {
      enrichment.title = text;
    }
  }

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
