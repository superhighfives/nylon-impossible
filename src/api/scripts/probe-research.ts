/**
 * Probe kimi-k2.6 research / enrichment outside the app.
 *
 * Hits the Workers AI REST API directly with the same payload research.ts
 * and ai.ts use, so you can verify web search is actually firing and see
 * the raw model response without going through the queue or durable
 * object plumbing.
 *
 * Usage (reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from src/api/.env
 * or the shell env):
 *
 *   pnpm --filter @nylon-impossible/api probe research "Research dogs"
 *   pnpm --filter @nylon-impossible/api probe enrich "Research dogs"
 *
 * The first form runs the executeGeneralResearch payload (web_search_options
 * + thinking off). The second runs the enrichTodo classifier so you can see
 * whether the model decides the input needs research at all.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "@cf/moonshotai/kimi-k2.6";

type Mode = "research" | "enrich";

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

async function callWorkersAi(payload: unknown): Promise<unknown> {
  const accountId = readEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = readEnv("CLOUDFLARE_API_TOKEN");
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;

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
  return {
    messages: [
      {
        role: "system",
        content:
          "You are a metadata extractor. Given a todo, extract any URLs, due dates, priority, and decide whether it needs research (general or location).",
      },
      { role: "user", content: text },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "enrich_todo",
          description: "Extract metadata from a todo",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              urls: { type: "array", items: { type: "string" } },
              dueDate: { type: "string" },
              priority: { type: "string", enum: ["low", "high"] },
              research: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["general", "location"] },
                },
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
  const [, , modeArg, ...rest] = process.argv;
  const mode = modeArg as Mode | undefined;
  const query = rest.join(" ").trim();

  if (!mode || (mode !== "research" && mode !== "enrich") || !query) {
    console.error('Usage: probe-research.ts <research|enrich> "<query>"');
    process.exit(1);
  }

  // Validate creds up front before printing the banner.
  readEnv("CLOUDFLARE_API_TOKEN");
  readEnv("CLOUDFLARE_ACCOUNT_ID");

  const payload =
    mode === "research" ? researchPayload(query) : enrichPayload(query);

  console.log(`> ${mode}: ${query}`);
  console.log("---");
  const response = await callWorkersAi(payload);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
