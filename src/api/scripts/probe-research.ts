/**
 * Probe research / enrichment outside the app.
 *
 * Three modes:
 *   research — executeGeneralResearch payload via Workers AI REST API
 *   enrich   — enrichTodo classifier via Workers AI REST API
 *   tavily   — raw Tavily search call (verifies TAVILY_API_KEY works)
 *
 * Usage (reads creds from src/api/.env or the shell env):
 *
 *   pnpm --filter @nylon-impossible/api probe research "Research dogs"
 *   pnpm --filter @nylon-impossible/api probe enrich "Research dogs"
 *   pnpm --filter @nylon-impossible/api probe tavily "Research dogs"
 *
 * Override the Workers AI model (research / enrich only):
 *
 *   pnpm --filter @nylon-impossible/api probe \\
 *     --model @cf/zai-org/glm-4.7-flash enrich "Research dogs"
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

type Mode = "research" | "enrich" | "tavily";

async function callTavily(query: string): Promise<unknown> {
  const apiKey = readEnv("TAVILY_API_KEY");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tavily ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Minimal .env loader. Only sets vars that aren't already in process.env, so
 * shell-exported values still take precedence. Handles KEY=value lines,
 * comments, and surrounding double quotes — that's all this needs.
 */
function loadDotenv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "..", ".env");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotenv();

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function callWorkersAi(
  payload: unknown,
  model: string,
): Promise<unknown> {
  const accountId = readEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = readEnv("CLOUDFLARE_API_TOKEN");
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Workers AI ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function researchPayload(query: string) {
  const prompt = `Research the following topic and provide a brief 2-3 sentence summary with numbered citations.

Topic: "${query}"

Instructions:
1. Search for reliable, current information about this topic
2. Write a concise 2-3 sentence summary of the key findings
3. Use numbered citations [1], [2], etc. to reference your sources
4. Include only URLs from your search results — do not guess or fabricate URLs
5. Limit to 3-5 sources maximum

Format your response as JSON:
{
  "summary": "Your 2-3 sentence summary with [1], [2] citations inline.",
  "sources": ["https://source1.com/article", "https://source2.com/page"]
}

Only return valid JSON, no other text.`;

  return {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4000,
    chat_template_kwargs: { thinking: false },
    web_search_options: { search_context_size: "high" },
  };
}

function enrichPayload(text: string) {
  // Mirror the real schema and system prompt from src/api/src/lib/ai.ts so
  // the probe reproduces the actual enrichTodo call. If you change one,
  // change both.
  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = `You are a metadata extractor for todo items. Today's date is: ${today}

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
- "Research dogs" → { title: "Research dogs", research: { type: "general" } }
- "Dogs ages vs human ages" → { title: "Dogs ages vs human ages", research: { type: "general" } }
- "How does OAuth work" → { title: "How does OAuth work", research: { type: "general" } }
- "Buy milk" → { title: "Buy milk" }
- "Book dinner at San Jalisco" → { title: "Book dinner at San Jalisco", research: { type: "location" } }

Always call the enrich_todo tool with your findings.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    max_tokens: 4000,
    tools: [
      {
        type: "function",
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
                  "The original title with URLs/domains removed. Do NOT rephrase, reword, or change the meaning.",
              },
              urls: {
                type: "array",
                description:
                  "Extract URLs and domains that LITERALLY appear in the user's text. Never invent or fabricate URLs.",
                items: { type: "string" },
              },
              dueDate: {
                type: "string",
                description: "Due date in ISO format (YYYY-MM-DD).",
              },
              priority: {
                type: "string",
                enum: ["high", "low"],
              },
              research: {
                type: "object",
                description:
                  "Set when the todo has research intent - questions, comparisons, 'look up', 'how to', venue references.",
                properties: {
                  type: {
                    type: "string",
                    enum: ["general", "location"],
                  },
                },
                required: ["type"],
              },
            },
            required: ["title"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "enrich_todo" } },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  let model = DEFAULT_MODEL;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--model" && i + 1 < argv.length) {
      model = argv[++i];
    } else if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
    } else {
      positional.push(arg);
    }
  }

  const [modeArg, ...rest] = positional;
  const mode = modeArg as Mode | undefined;
  const query = rest.join(" ").trim();

  if (
    !mode ||
    (mode !== "research" && mode !== "enrich" && mode !== "tavily") ||
    !query
  ) {
    console.error(
      'Usage: probe-research.ts [--model=<id>] <research|enrich|tavily> "<query>"',
    );
    process.exit(1);
  }

  if (mode === "tavily") {
    readEnv("TAVILY_API_KEY");
    console.log(`> tavily: ${query}`);
    console.log("---");
    const response = await callTavily(query);
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  // Validate creds up front before printing the banner.
  readEnv("CLOUDFLARE_API_TOKEN");
  readEnv("CLOUDFLARE_ACCOUNT_ID");

  const payload =
    mode === "research" ? researchPayload(query) : enrichPayload(query);

  console.log(`> ${mode} [${model}]: ${query}`);
  console.log("---");
  const response = await callWorkersAi(payload, model);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
