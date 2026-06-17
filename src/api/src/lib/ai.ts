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
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
  };
  research?: {
    type: "general" | "location";
  };
  // Search-optimized version of the topic — used as the Tavily query when
  // research is set. Strips imperative verbs ("Research X" -> "X") so we
  // don't search for the meta-topic of researching the thing.
  searchQuery?: string;
  // Present if the agent decided to ask the user a clarifying question.
  question?: string;
}

// A single turn in a todo's conversation thread, oldest-first, used to
// re-enrich after the user replies to the agent's question.
export interface ConversationTurn {
  role: "assistant" | "user";
  content: string;
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

export const enrichTodoTool = {
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
        recurrence: {
          type: "object",
          description:
            "Set when the todo repeats. Look for phrases like 'every day', 'daily', 'every Monday', 'weekly', 'monthly', 'each month', 'yearly', 'annually'. Pair with a dueDate (next matching occurrence). Do NOT set for one-off tasks.",
          properties: {
            frequency: {
              type: "string",
              enum: ["daily", "weekly", "monthly", "yearly"],
              description:
                "'daily' = every day. 'weekly' = every week on the same weekday as dueDate. 'monthly' = same day-of-month. 'yearly' = same month+day.",
            },
          },
          required: ["frequency"],
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
        searchQuery: {
          type: "string",
          description:
            "ONLY set when research is set. A search-engine-optimized version of the topic for Tavily. Strip imperative verbs and todo framing so the query reflects what the user wants to learn, not the meta-task of researching it. Examples: 'Research dogs' -> 'dogs'; 'Look up white chocolate recipe' -> 'white chocolate recipe'; 'How does OAuth work' -> 'how OAuth works'; 'Book dinner at San Jalisco' -> 'San Jalisco restaurant'. Keep proper nouns and topic-specific words; drop 'research', 'look up', 'find out about', 'check', 'book', etc.",
        },
      },
      required: ["title"],
    },
  },
};

export const askUserTool = {
  type: "function" as const,
  function: {
    name: "ask_user",
    description:
      "Ask the user ONE clarifying question. Only use when the todo is genuinely unactionable without more info and a short answer would meaningfully improve enrichment (destination, date, scope). Do NOT use for stylistic preferences, things you can reasonably assume, or already-actionable todos like 'Buy milk' or 'Email Sarah'.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "A single, specific question under 80 characters.",
        },
      },
      required: ["question"],
    },
  },
};

export function getSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0];

  return `You are a metadata extractor for todo items. Today's date is: ${today}

Your ONLY job is to extract metadata from the user's text:
1. URLs/domains - find them and remove them from the title
2. Due dates - convert relative dates to ISO format
3. Priority - if mentioned
4. Recurrence - "every day"/"daily", "every Monday"/"weekly", "monthly", "yearly". Pair with a dueDate for the next matching occurrence.
5. Research intent - questions, comparisons, "look up", "how to", venue references

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
- WHEN research IS SET, you MUST also populate searchQuery: a Tavily-optimized phrasing of the topic. Strip imperative verbs ("Research", "Look up", "Find out about", "Check", "Book") and todo framing — the query should describe what the user wants to learn, not the act of researching it. Keep proper nouns and topic words. Examples below.

Examples:
- "Hello google.com" → { title: "Hello", urls: ["https://google.com"] }
- "Research https://google.com" → { title: "Research google.com", urls: ["https://google.com"] }
- "Check out https://example.com/page tomorrow" → { title: "Check out tomorrow", urls: ["https://example.com/page"], dueDate: "${today}" }
- "Buy milk" → { title: "Buy milk" } (no research - plain action)
- "Urgent: call mom" → { title: "Urgent: call mom", priority: "high" } (no research - plain action)
- "github.com/user/repo review this" → { title: "review this", urls: ["https://github.com/user/repo"] }
- "Low priority fix the bug" → { title: "Low priority fix the bug", priority: "low" } (no research - plain action)
- "Meeting next Friday" → { title: "Meeting next Friday", dueDate: "[next Friday's date]" }
- "Every Monday review backlog" → { title: "review backlog", dueDate: "[next Monday]", recurrence: { frequency: "weekly" } }
- "Daily standup at 10am" → { title: "Daily standup at 10am", dueDate: "${today}", recurrence: { frequency: "daily" } }
- "Pay rent on the 1st of every month" → { title: "Pay rent", dueDate: "[next 1st of month]", recurrence: { frequency: "monthly" } }
- "Dogs ages vs human ages" → { title: "Dogs ages vs human ages", research: { type: "general" }, searchQuery: "dog ages vs human ages" }
- "How does OAuth work" → { title: "How does OAuth work", research: { type: "general" }, searchQuery: "how OAuth works" }
- "Best practices for React Server Components" → { title: "Best practices for React Server Components", research: { type: "general" }, searchQuery: "React Server Components best practices" }
- "Look up white chocolate recipe" → { title: "Look up white chocolate recipe", research: { type: "general" }, searchQuery: "white chocolate recipe" } (no urls — topic only, no URL in text)
- "Research back pain remedies" → { title: "Research back pain remedies", research: { type: "general" }, searchQuery: "back pain remedies" } (no urls — do NOT invent domains like "backpainremedies.com")
- "Research dogs" → { title: "Research dogs", research: { type: "general" }, searchQuery: "dogs" }
- "Book dinner at San Jalisco" → { title: "Book dinner at San Jalisco", research: { type: "location" }, searchQuery: "San Jalisco restaurant" }
- "Drinks at The Rusty Nail" → { title: "Drinks at The Rusty Nail", research: { type: "location" }, searchQuery: "The Rusty Nail bar" }
- "Check out that new ramen place on Main St" → { title: "Check out that new ramen place on Main St", research: { type: "location" }, searchQuery: "ramen Main St" }

ASKING A CLARIFYING QUESTION:
- You may also call the ask_user tool to ask ONE short clarifying question, but ONLY when the todo is genuinely unactionable without more info and a short answer would meaningfully improve enrichment. Most todos should NOT trigger a question.
- When you ask, still call enrich_todo too with whatever you can extract from the current text (partial info is fine).
- If a conversation history is provided and you have ALREADY asked once, strongly prefer enriching with what you now know — only ask again if something is genuinely still blocking action.
- Examples that SHOULD ask: "Book a flight" → ask("Where to, and when?"); "Plan birthday party" → ask("Whose birthday, and any date in mind?").
- Examples that should NOT ask (enrich only): "Buy milk", "Call mom", "Email Sarah about the Q3 numbers", "Research dog breeds".

Always call the enrich_todo tool with your findings.`;
}

/**
 * Normalize a raw Workers AI response into a single tool call, handling both
 * the native Workers AI format (top-level tool_calls) and the OpenAI-compatible
 * chat completions format (choices[0].message.tool_calls).
 */
export function extractToolCall(response: unknown): ParsedToolCall | null {
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

/**
 * Like {@link extractToolCall} but returns every tool call, not just the first.
 * Needed now that the model may call both `enrich_todo` and `ask_user` in one
 * turn. Arguments are returned raw (parsed from JSON if needed); callers narrow
 * them per tool name.
 */
export function extractAllToolCalls(
  response: unknown,
): Array<{ name: string; arguments: Record<string, unknown> }> {
  const native = response as WorkersAIToolCallResponse;
  if (native.tool_calls?.length) {
    return native.tool_calls.map((tc) => ({
      name: tc.name,
      arguments: parseRawArguments(tc.arguments),
    }));
  }

  const openai = response as OpenAICompatToolCallResponse;
  const toolCalls = openai.choices?.[0]?.message?.tool_calls;
  if (toolCalls?.length) {
    return toolCalls
      .filter((tc) => tc.function)
      .map((tc) => ({
        // biome-ignore lint/style/noNonNullAssertion: filtered above
        name: tc.function!.name,
        // biome-ignore lint/style/noNonNullAssertion: filtered above
        arguments: parseRawArguments(tc.function!.arguments),
      }));
  }

  return [];
}

function parseRawArguments(
  args: Record<string, unknown> | string | unknown,
): Record<string, unknown> {
  if (typeof args === "string") {
    return JSON.parse(args.trim());
  }
  return (args ?? {}) as Record<string, unknown>;
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
  history?: ConversationTurn[],
): Promise<TodoEnrichment | null> {
  const systemPrompt = getSystemPrompt();

  // Base turn is the todo itself; any prior conversation (the agent's question
  // and the user's reply) follows so the model re-enriches with full context.
  const messages: Array<{
    role: "system" | "assistant" | "user";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ];
  if (history?.length) {
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  const response = await runWithTimeout(
    ai.run(
      "@cf/openai/gpt-oss-120b",
      {
        messages,
        // Offer both tools; the model decides whether to enrich, ask, or both.
        tools: [enrichTodoTool, askUserTool],
        tool_choice: "auto",
        max_tokens: 4000,
      },
      gatewayId ? { gateway: { id: gatewayId } } : {},
    ),
    ENRICH_TIMEOUT_MS,
  );

  const toolCalls = extractAllToolCalls(response);

  if (toolCalls.length === 0) {
    const shape = describeResponseShape(response);
    console.error("No tool call found in AI response", shape);
    throw new Error(`AI did not return enrichment (shape: ${shape})`);
  }

  const enrichCall = toolCalls.find((tc) => tc.name === "enrich_todo");
  const askCall = toolCalls.find((tc) => tc.name === "ask_user");

  if (!enrichCall && !askCall) {
    throw new Error(`Unexpected tool call: ${toolCalls[0].name}`);
  }

  // Merge into one enrichment shape. ask_user-only keeps the title unchanged
  // (so no rewrite happens downstream) and carries just the question.
  const enrichment: TodoEnrichment = enrichCall
    ? (enrichCall.arguments as unknown as TodoEnrichment)
    : { title: text };

  // enrich_todo can omit the title in rare malformed responses; fall back to
  // the original text so downstream title logic always has a string.
  if (typeof enrichment.title !== "string" || enrichment.title.length === 0) {
    enrichment.title = text;
  }

  if (askCall && typeof askCall.arguments.question === "string") {
    const question = askCall.arguments.question.trim();
    if (question) enrichment.question = question;
  }

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

  // If nothing was extracted (no URLs, no date, no priority, no research, no
  // question), return null
  const hasEnrichment =
    (enrichment.urls && enrichment.urls.length > 0) ||
    enrichment.dueDate ||
    enrichment.priority ||
    enrichment.research ||
    enrichment.question;

  if (!hasEnrichment && enrichment.title === text) {
    return null;
  }

  return enrichment;
}
