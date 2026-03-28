/**
 * Research execution for todos
 *
 * Runs web search via Workers AI to gather information about a topic,
 * then stores a summary with numbered citations linking to source URLs.
 */

import { generateNKeysBetween } from "fractional-indexing";
import { eq, type getDb, todoResearch, todoUrls } from "./db";
import { fetchUrlMetadata } from "./url-metadata";

// Keep this well under the Worker's waitUntil duration limit so the catch
// block has time to mark the research as "failed" before the Worker is killed.
// enrichTodo (30s) + research (20s) + buffer = ~55s total, which fits safely.
const RESEARCH_TIMEOUT_MS = 20_000;

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
  env: { USER_SYNC: DurableObjectNamespace },
  todoId: string,
  userId: string,
  query: string,
  researchType: "general" | "location",
  researchId: string,
  userLocation?: string | null,
): Promise<void> {
  try {
    const result =
      researchType === "location"
        ? await executeLocationResearch(ai, query, userLocation)
        : await executeGeneralResearch(ai, query);

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
    if (result.sources.length > 0) {
      const now = new Date();
      const urlPositions = generateNKeysBetween(
        null,
        null,
        result.sources.length,
      );

      urlRecords = result.sources.map((url, i) => ({
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
            console.error(`Failed to fetch metadata for ${record.url}:`, error);
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
    console.error("Research failed for todo:", todoId, error);

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
 * Execute general research (questions, comparisons, how-to topics)
 */
async function executeGeneralResearch(
  ai: Ai,
  query: string,
): Promise<ResearchResult> {
  const prompt = `Research the following topic and provide a brief 2-3 sentence summary with numbered citations.

Topic: "${query}"

Instructions:
1. Search for reliable, current information about this topic
2. Write a concise 2-3 sentence summary of the key findings
3. Use numbered citations [1], [2], etc. to reference your sources
4. Return the source URLs in order

Format your response as JSON:
{
  "summary": "Your 2-3 sentence summary with [1], [2] citations inline.",
  "sources": ["https://source1.com", "https://source2.com"]
}

Only return valid JSON, no other text.`;

  const response = await runWithTimeout(
    ai.run(
      "@cf/moonshotai/kimi-k2.5" as Parameters<typeof ai.run>[0],
      {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
      },
      {
        gateway: {
          id: "nylon-impossible",
        },
      },
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
): Promise<ResearchResult> {
  const searchQuery = userLocation ? `${query} near ${userLocation}` : query;

  const prompt = `Find information about this venue/location and provide a brief summary.

Query: "${searchQuery}"

Instructions:
1. Search for this specific venue/place
2. Write 1-2 sentences describing what it is and where it's located
3. Use [1] to cite the venue's official website (if available)
4. Use [2] to cite the Google Maps link
5. Return the source URLs in order

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
      },
      {
        gateway: {
          id: "nylon-impossible",
        },
      },
    ),
    RESEARCH_TIMEOUT_MS,
  );

  return parseResearchResponse(response);
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
    return {
      summary: parsed.summary ?? text.trim(),
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.filter(
            (s: unknown) => typeof s === "string" && s.startsWith("http"),
          )
        : [],
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
async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Research timed out")), timeoutMs);
  });

  return Promise.race([promise, timeout]);
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
