/**
 * Research execution for todos
 *
 * Searches the web via Tavily for grounded sources, then asks Workers AI to
 * write a brief summary with numbered citations referencing those sources.
 *
 * Tavily is required: no Workers AI model currently performs real web search
 * (web_search_options is silently ignored across kimi-k2.5/k2.6, glm-4.7-flash,
 * gemma-4 — probe-confirmed). Without grounded sources the model fabricates
 * URLs from training data.
 */

import * as Sentry from "@sentry/cloudflare";
import { generateNKeysBetween } from "fractional-indexing";
import { eq, type getDb, todoResearch, todoUrls } from "./db";
import { fetchUrlMetadata } from "./url-metadata";

// Queue consumer has its own execution budget — 5 minutes before we give up.
const RESEARCH_TIMEOUT_MS = 5 * 60 * 1_000;

interface ResearchResult {
  summary: string;
  sources: string[];
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

/**
 * Execute research for a todo in the background.
 * Updates the todoResearch record with results and inserts source URLs.
 */
export async function executeResearch(
  db: ReturnType<typeof getDb>,
  ai: Ai,
  env: {
    USER_SYNC: DurableObjectNamespace;
    CF_AI_GATEWAY_ID?: string;
    TAVILY_API_KEY?: string;
  },
  todoId: string,
  userId: string,
  query: string,
  researchType: "general" | "location",
  researchId: string,
  userLocation?: string | null,
): Promise<void> {
  try {
    if (!env.TAVILY_API_KEY) {
      throw new Error(
        "TAVILY_API_KEY is not configured — set it via `wrangler secret put TAVILY_API_KEY`",
      );
    }
    const gatewayId = env.CF_AI_GATEWAY_ID;
    const result =
      researchType === "location"
        ? await executeLocationResearch(
            ai,
            query,
            userLocation,
            gatewayId,
            env.TAVILY_API_KEY,
          )
        : await executeGeneralResearch(
            ai,
            query,
            userLocation,
            gatewayId,
            env.TAVILY_API_KEY,
          );

    // Deduplicate sources returned by the AI, normalizing URLs so
    // "https://google.com" and "https://google.com/" are treated as the same.
    const seen = new Set<string>();
    const uniqueSources = result.sources.filter((url) => {
      let key = url;
      try {
        key = new URL(url).href;
      } catch {
        // keep raw url as key
      }
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Cap sources to the prompt-requested maximum (5). The model may return
    // more, and each source triggers a HEAD check + metadata fetch.
    const MAX_SOURCES = 5;
    const cappedSources = uniqueSources.slice(0, MAX_SOURCES);

    // Verify each URL is actually reachable before persisting it. The AI
    // sometimes returns URLs that look plausible but 404 or don't resolve,
    // so we drop those now rather than storing them and marking them
    // "failed" during metadata fetch (which leaves dead links in the UI).
    const reachabilityChecks = await Promise.all(
      cappedSources.map(async (url) => ({
        url,
        reachable: await isUrlReachable(url),
      })),
    );
    const reachableSources = reachabilityChecks
      .filter((r) => r.reachable)
      .map((r) => r.url);

    // Insert source URLs with researchId
    let urlRecords: {
      id: string;
      todoId: string;
      researchId: string;
      url: string;
      position: string;
      fetchStatus: "pending";
      createdAt: Date;
      updatedAt: Date;
    }[] = [];
    if (reachableSources.length > 0) {
      const now = new Date();
      const urlPositions = generateNKeysBetween(
        null,
        null,
        reachableSources.length,
      );

      urlRecords = reachableSources.map((url, i) => ({
        id: crypto.randomUUID(),
        todoId,
        researchId,
        url,
        position: urlPositions[i],
        fetchStatus: "pending" as const,
        createdAt: now,
        updatedAt: now,
      }));

      await db.insert(todoUrls).values(urlRecords);
    }

    // Check if research was cancelled while the AI was running
    const [current] = await db
      .select({ status: todoResearch.status })
      .from(todoResearch)
      .where(eq(todoResearch.id, researchId));

    if (current?.status !== "pending") {
      // Research was cancelled or already in a terminal state — discard results
      return;
    }

    // Mark research as completed immediately so clients can show results
    await db
      .update(todoResearch)
      .set({
        status: "completed",
        summary: result.summary,
        researchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(todoResearch.id, researchId));

    Sentry.addBreadcrumb({
      category: "research",
      message: "research.completed",
      data: { type: researchType },
      level: "info",
    });

    // Notify clients that research is complete (summary + URLs available)
    await notifySync(env, userId);

    // Fetch URL metadata in background (non-blocking for UI)
    if (urlRecords.length > 0) {
      await Promise.allSettled(
        urlRecords.map(async (record) => {
          try {
            const metadata = await fetchUrlMetadata(record.url);
            await db
              .update(todoUrls)
              .set({
                title: metadata.title,
                description: metadata.description,
                siteName: metadata.siteName,
                favicon: metadata.favicon,
                fetchStatus: "fetched" as const,
                fetchedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(todoUrls.id, record.id));
          } catch (error) {
            Sentry.captureException(error, {
              tags: { area: "url-metadata" },
            });
            await db
              .update(todoUrls)
              .set({
                fetchStatus: "failed" as const,
                updatedAt: new Date(),
              })
              .where(eq(todoUrls.id, record.id));
          }
        }),
      );

      // Notify again once URL metadata is ready
      await notifySync(env, userId);
    }
  } catch (error) {
    Sentry.addBreadcrumb({
      category: "research",
      message: "research.failed",
      level: "error",
    });

    Sentry.captureException(error, {
      tags: { area: "research" },
      extra: { researchType },
    });

    await db
      .update(todoResearch)
      .set({
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(todoResearch.id, researchId));

    await notifySync(env, userId);
  }
}

/**
 * Search the web via Tavily and return ranked results.
 *
 * topic: "general" for questions/comparisons/how-to; "general" + a near-by
 * suffix for venues. Tavily doesn't have a dedicated "places" mode, so we
 * lean on query phrasing.
 */
async function searchWeb(
  query: string,
  apiKey: string,
  searchDepth: "basic" | "advanced" = "advanced",
  maxResults = 5,
): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tavily search failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { results?: TavilyResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Ask the model to write a brief summary of the topic using ONLY the
 * Tavily-supplied sources. The model never emits URLs — those come from
 * Tavily directly, so fabrication is impossible.
 */
async function summarizeWithSources(
  ai: Ai,
  query: string,
  sources: TavilyResult[],
  promptIntro: string,
  gatewayId?: string,
): Promise<string> {
  const numbered = sources
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}\nExcerpt: ${s.content}`,
    )
    .join("\n\n");

  const prompt = `${promptIntro}

Topic: "${query}"

Sources:
${numbered}

Instructions:
1. Write a concise 2-3 sentence summary using ONLY the information in the sources above.
2. Insert numbered citations [1], [2], etc. inline that reference the sources by their number.
3. Do not output URLs — only the citation markers.
4. Do not include any text other than the summary itself.`;

  const response = await runWithTimeout(
    ai.run(
      "@cf/zai-org/glm-4.7-flash",
      {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
      },
      gatewayId ? { gateway: { id: gatewayId } } : {},
    ),
    RESEARCH_TIMEOUT_MS,
  );

  return extractSummaryText(response);
}

/**
 * Execute general research (questions, comparisons, how-to topics)
 */
async function executeGeneralResearch(
  ai: Ai,
  query: string,
  _userLocation: string | null | undefined,
  gatewayId: string | undefined,
  tavilyApiKey: string,
): Promise<ResearchResult> {
  const results = await searchWeb(query, tavilyApiKey);
  if (results.length === 0) {
    return { summary: "No web results were found for this topic.", sources: [] };
  }

  const summary = await summarizeWithSources(
    ai,
    query,
    results,
    "Summarize the following research topic for a todo app user.",
    gatewayId,
  );

  return { summary, sources: results.map((r) => r.url) };
}

/**
 * Execute location research (venues, restaurants, bars, etc.)
 */
async function executeLocationResearch(
  ai: Ai,
  query: string,
  userLocation: string | null | undefined,
  gatewayId: string | undefined,
  tavilyApiKey: string,
): Promise<ResearchResult> {
  const searchQuery = userLocation ? `${query} near ${userLocation}` : query;
  const results = await searchWeb(searchQuery, tavilyApiKey);
  if (results.length === 0) {
    return {
      summary: "No web results were found for this location.",
      sources: [],
    };
  }

  const summary = await summarizeWithSources(
    ai,
    searchQuery,
    results,
    "Summarize the following venue/location for a todo app user. Mention what it is and where it's located.",
    gatewayId,
  );

  return { summary, sources: results.map((r) => r.url) };
}

// How long each reachability check is allowed to take. Short so a single
// dead URL can't stall the whole pipeline — we run them in parallel anyway.
const REACHABILITY_TIMEOUT_MS = 5_000;

/**
 * Verify that a URL actually resolves to content, not a 404 / NXDOMAIN.
 * Issues a HEAD request first (cheap, no body), falling back to a
 * Range-limited GET if the server rejects HEAD with 405/501. Redirects
 * are followed automatically by fetch, so the final response is always
 * the terminal status (typically 2xx). Any network error, timeout, or
 * non-2xx response counts as unreachable.
 *
 * Used to filter out URLs the AI returned but that don't exist — either
 * stale links from web-search results or fabricated ones that slipped past
 * the `isPlausibleUrl` heuristics.
 */
export async function isUrlReachable(url: string): Promise<boolean> {
  const doFetch = (method: "HEAD" | "GET") =>
    fetch(url, {
      method,
      headers: {
        "User-Agent": "NylonBot/1.0",
        // Range request keeps the GET fallback cheap — we only need the
        // status code, not the body.
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REACHABILITY_TIMEOUT_MS),
    });

  try {
    let response = await doFetch("HEAD");
    // Some servers refuse HEAD — retry once with GET before giving up.
    if (response.status === 405 || response.status === 501) {
      response = await doFetch("GET");
    }
    // response.ok covers 200-299; 206 is Partial Content from Range GET.
    return response.ok || response.status === 206;
  } catch {
    // Network error, DNS failure, TLS error, or timeout — treat as dead.
    return false;
  }
}

/**
 * Check whether a URL looks plausible (not obviously hallucinated).
 * Rejects URLs with telltale signs of LLM fabrication like encoded spaces
 * in the path or fake Google search result parameters.
 */
export function isPlausibleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Reject URLs with encoded spaces in the pathname — a strong sign of fabrication
    // (e.g., google.com/kittens%20with%20long%20hair/search)
    if (/%20/.test(parsed.pathname)) {
      return false;
    }

    // Google host handling: allow Maps URLs, reject other deep links with query
    // params because the model often fabricates search result URLs with fake
    // params like ved=, ei=, etc.
    const isGoogleHost =
      parsed.hostname === "google.com" ||
      parsed.hostname === "www.google.com" ||
      parsed.hostname === "maps.google.com";

    if (isGoogleHost) {
      // Allow any /maps/ path (place, dir, search, etc.)
      if (parsed.pathname.startsWith("/maps/")) return true;
      // Reject other Google URLs with query params (search results, images, etc.)
      if (parsed.search.length > 0) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Pull the assistant's plain-text reply out of a Workers AI response. The
 * binding can return either the native shape ({ response }) or the
 * OpenAI-compatible shape ({ choices[0].message.content }) depending on the
 * model — accept both. Strips surrounding whitespace.
 */
function extractSummaryText(response: unknown): string {
  if (typeof response === "string") return response.trim();
  if (response && typeof response === "object") {
    if ("response" in response) {
      const r = (response as { response?: string }).response;
      if (r) return r.trim();
    }
    if ("choices" in response) {
      const r = response as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = r.choices?.[0]?.message?.content;
      if (content) return content.trim();
    }
  }
  throw new Error("No response text from AI");
}

/**
 * Run a promise with a timeout
 */
function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Research timed out")),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Notify all connected WebSocket clients for this user to sync
 */
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical - clients will sync on next poll
  }
}
