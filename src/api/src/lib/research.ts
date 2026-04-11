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
    if (uniqueSources.length > 0) {
      const now = new Date();
      const urlPositions = generateNKeysBetween(
        null,
        null,
        uniqueSources.length,
      );

      urlRecords = uniqueSources.map((url, i) => ({
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

  const response = await runWithTimeout(
    ai.run(
      "@cf/moonshotai/kimi-k2.5" as Parameters<typeof ai.run>[0],
      {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        web_search_options: {
          search_context_size: "high",
          user_location: parseUserLocation(userLocation),
        },
      } as Record<string, unknown>,
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

  const response = await runWithTimeout(
    ai.run(
      "@cf/moonshotai/kimi-k2.5" as Parameters<typeof ai.run>[0],
      {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        web_search_options: {
          search_context_size: "high",
          user_location: parseUserLocation(userLocation),
        },
      } as Record<string, unknown>,
      gatewayId ? { gateway: { id: gatewayId } } : {},
    ),
    RESEARCH_TIMEOUT_MS,
  );

  return parseResearchResponse(response);
}

/**
 * Check whether a URL looks plausible (not obviously hallucinated).
 * Rejects URLs with telltale signs of LLM fabrication like encoded spaces
 * in the path, fake Google search result parameters, or excessive path depth.
 */
function isPlausibleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Reject URLs with encoded spaces in the pathname — a strong sign of fabrication
    // (e.g., google.com/kittens%20with%20long%20hair/search)
    if (/%20/.test(parsed.pathname) || /\+/.test(parsed.pathname)) {
      return false;
    }

    // Reject google.com deep links (except simple Maps search URLs) — the model
    // loves to fabricate Google search result URLs with fake params like ved=, ei=, etc.
    if (
      parsed.hostname === "google.com" ||
      parsed.hostname === "www.google.com"
    ) {
      // Allow simple Google Maps search URLs
      if (parsed.pathname.startsWith("/maps/search/")) return true;
      // Reject everything else (search results, image searches, etc.)
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
      // OpenAI-compatible format (returned by kimi-k2.5)
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
