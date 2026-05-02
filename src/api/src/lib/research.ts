/**
 * Research execution for todos
 *
 * Runs web search via Workers AI to gather information about a topic,
 * then stores a summary with numbered citations linking to source URLs.
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

/**
 * Workers AI options for kimi-k2.6 with web_search_options.
 * The @cloudflare/workers-types package types `web_search_options` for
 * ChatCompletions-compatible models, but the `ai.run` signature is narrowed
 * per model. We declare the exact shape we need so callers get compile-time
 * checks on our options.
 */
interface ChatCompletionsWithSearchOptions {
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  // kimi-k2.6's built-in web search is incompatible with thinking mode.
  // Set thinking: false so the model actually performs the search instead
  // of silently ignoring web_search_options and generating from training
  // data (which produces fabricated URLs).
  // NB: kimi-k2.5 used `enable_thinking`; kimi-k2.6 renamed it to `thinking`.
  chat_template_kwargs?: { thinking?: boolean };
  web_search_options?: {
    search_context_size?: "low" | "medium" | "high";
    user_location?: {
      type: "approximate";
      approximate: { city?: string; region?: string; country?: string };
    };
  };
}

/**
 * Execute research for a todo in the background.
 * Updates the todoResearch record with results and inserts source URLs.
 */
export async function executeResearch(
  db: ReturnType<typeof getDb>,
  ai: Ai,
  env: { USER_SYNC: DurableObjectNamespace; CF_AI_GATEWAY_ID?: string },
  todoId: string,
  userId: string,
  query: string,
  researchType: "general" | "location",
  researchId: string,
  userLocation?: string | null,
): Promise<void> {
  try {
    const gatewayId = env.CF_AI_GATEWAY_ID;
    const result =
      researchType === "location"
        ? await executeLocationResearch(ai, query, userLocation, gatewayId)
        : await executeGeneralResearch(ai, query, userLocation, gatewayId);

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
 * Parse a user location string (e.g., "Los Angeles, CA") into the
 * WebSearchUserLocation format expected by Workers AI.
 */
function parseUserLocation(
  location?: string | null,
):
  | { type: "approximate"; approximate: { city?: string; region?: string } }
  | undefined {
  if (!location) return undefined;
  const parts = location.split(",").map((s) => s.trim());
  return {
    type: "approximate",
    approximate: {
      city: parts[0] || undefined,
      region: parts[1] || undefined,
    },
  };
}

/**
 * Execute general research (questions, comparisons, how-to topics)
 */
async function executeGeneralResearch(
  ai: Ai,
  query: string,
  userLocation?: string | null,
  gatewayId?: string,
): Promise<ResearchResult> {
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

  const options: ChatCompletionsWithSearchOptions = {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4000,
    chat_template_kwargs: { thinking: false },
    web_search_options: {
      search_context_size: "high",
      user_location: parseUserLocation(userLocation),
    },
  };

  const response = await runWithTimeout(
    ai.run(
      "@cf/moonshotai/kimi-k2.6" as Parameters<typeof ai.run>[0],
      options as unknown as Parameters<typeof ai.run>[1],
      gatewayId ? { gateway: { id: gatewayId } } : {},
    ),
    RESEARCH_TIMEOUT_MS,
  );

  return parseResearchResponse(response);
}

/**
 * Execute location research (venues, restaurants, bars, etc.)
 */
async function executeLocationResearch(
  ai: Ai,
  query: string,
  userLocation?: string | null,
  gatewayId?: string,
): Promise<ResearchResult> {
  const searchQuery = userLocation ? `${query} near ${userLocation}` : query;

  const prompt = `Find information about this venue/location and provide a brief summary.

Query: "${searchQuery}"

Instructions:
1. Search for this specific venue/place
2. Write 1-2 sentences describing what it is and where it's located
3. Use [1] to cite the venue's official website (if found)
4. Use [2] to cite a maps or review link (if found)
5. Include only URLs from your search results — do not guess or fabricate URLs

Format your response as JSON:
{
  "summary": "Brief description of the venue with [1] and [2] citations.",
  "sources": ["https://venue-website.com", "https://maps.google.com/..."]
}

Only return valid JSON, no other text.`;

  const options: ChatCompletionsWithSearchOptions = {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4000,
    chat_template_kwargs: { thinking: false },
    web_search_options: {
      search_context_size: "high",
      user_location: parseUserLocation(userLocation),
    },
  };

  const response = await runWithTimeout(
    ai.run(
      "@cf/moonshotai/kimi-k2.6" as Parameters<typeof ai.run>[0],
      options as unknown as Parameters<typeof ai.run>[1],
      gatewayId ? { gateway: { id: gatewayId } } : {},
    ),
    RESEARCH_TIMEOUT_MS,
  );

  return parseResearchResponse(response);
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
 * Parse AI response into summary and sources
 */
function parseResearchResponse(response: unknown): ResearchResult {
  // Handle various response formats from Workers AI
  let text: string | undefined;

  if (typeof response === "string") {
    text = response;
  } else if (response && typeof response === "object") {
    if ("response" in response) {
      // Workers AI native format
      text = (response as { response?: string }).response ?? undefined;
    } else if ("choices" in response) {
      // OpenAI-compatible format
      const r = response as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      text = r.choices?.[0]?.message?.content ?? undefined;
    }
  }

  if (!text) {
    throw new Error("No response text from AI");
  }

  // Try to extract JSON from the response
  // The model might include markdown code blocks or other text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // If no JSON found, use the entire response as summary with no sources
    return {
      summary: text.trim(),
      sources: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const rawSources = Array.isArray(parsed.sources)
      ? parsed.sources.filter(
          (s: unknown) => typeof s === "string" && s.startsWith("http"),
        )
      : [];
    return {
      summary: parsed.summary ?? text.trim(),
      sources: rawSources.filter((url: string) => isPlausibleUrl(url)),
    };
  } catch {
    // JSON parse failed, use raw text
    return {
      summary: text.trim(),
      sources: [],
    };
  }
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
