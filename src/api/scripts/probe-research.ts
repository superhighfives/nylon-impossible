/**
 * Probe the production AI flows outside the app.
 *
 * Three modes:
 *   enrich   — enrichTodo classifier via Workers AI REST API
 *   fetch    — raw Tavily search call (verifies TAVILY_API_KEY works)
 *   research — full Tavily → summarize chain that production runs for
 *              research-typed todos
 *
 * Usage (reads creds from src/api/.env or the shell env):
 *
 *   pnpm --filter @nylon-impossible/api probe enrich "Research dogs"
 *   pnpm --filter @nylon-impossible/api probe fetch "Research dogs"
 *   pnpm --filter @nylon-impossible/api probe research "Research dogs"
 *
 * Override the Workers AI model (enrich / research only):
 *
 *   pnpm --filter @nylon-impossible/api probe \\
 *     --model @cf/openai/gpt-oss-120b enrich "Research dogs"
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichTodoTool, getSystemPrompt } from "../src/lib/ai";
import {
  buildSummarizePayload,
  SUMMARIZE_MODEL,
  type TavilyResult,
} from "../src/lib/research";

const ENRICH_DEFAULT_MODEL = "@cf/openai/gpt-oss-120b";

type Mode = "enrich" | "fetch" | "research";

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

function enrichPayload(text: string) {
  return {
    messages: [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: text },
    ],
    max_tokens: 4000,
    tools: [enrichTodoTool],
    tool_choice: { type: "function", function: { name: "enrich_todo" } },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  let modelOverride: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--model" && i + 1 < argv.length) {
      modelOverride = argv[++i];
    } else if (arg.startsWith("--model=")) {
      modelOverride = arg.slice("--model=".length);
    } else {
      positional.push(arg);
    }
  }

  const [modeArg, ...rest] = positional;
  const mode = modeArg as Mode | undefined;
  const query = rest.join(" ").trim();

  if (
    !mode ||
    (mode !== "enrich" && mode !== "fetch" && mode !== "research") ||
    !query
  ) {
    console.error(
      'Usage: probe-research.ts [--model=<id>] <enrich|fetch|research> "<query>"',
    );
    process.exit(1);
  }

  if (mode === "fetch") {
    readEnv("TAVILY_API_KEY");
    console.log(`> fetch: ${query}`);
    console.log("---");
    const response = await callTavily(query);
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  // Both enrich and research need Workers AI creds.
  readEnv("CLOUDFLARE_API_TOKEN");
  readEnv("CLOUDFLARE_ACCOUNT_ID");

  if (mode === "research") {
    readEnv("TAVILY_API_KEY");
    const model = modelOverride ?? SUMMARIZE_MODEL;
    console.log(`> research [${model}]: ${query}`);
    console.log("---");
    const tavily = (await callTavily(query)) as { results?: TavilyResult[] };
    const sources = tavily.results ?? [];
    console.log(`Tavily returned ${sources.length} sources`);
    if (sources.length === 0) {
      console.log("(skipping summarize — no sources to ground in)");
      return;
    }
    const payload = buildSummarizePayload(
      query,
      sources,
      "Summarize the following research topic for a todo app user.",
    );
    const response = await callWorkersAi(payload, model);
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const model = modelOverride ?? ENRICH_DEFAULT_MODEL;
  const payload = enrichPayload(query);
  console.log(`> enrich [${model}]: ${query}`);
  console.log("---");
  const response = await callWorkersAi(payload, model);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
