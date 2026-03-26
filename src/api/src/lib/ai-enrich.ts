/**
 * Background AI enrichment for todos
 *
 * Takes an existing todo and enriches it with AI-extracted data:
 * - Cleaner title (action-oriented)
 * - Extracted URLs
 * - Due date from natural language
 */

import { generateNKeysBetween } from "fractional-indexing";
import { extractTodos } from "./ai";
import { eq, type getDb, todos, todoUrls } from "./db";
import { truncateTitle } from "./url-helpers";
import { fetchUrlMetadata } from "./url-metadata";

/**
 * Enrich a todo with AI-extracted data in the background.
 * Updates the todo in place and notifies connected clients.
 */
export async function enrichTodoWithAI(
  db: ReturnType<typeof getDb>,
  ai: Ai,
  env: { USER_SYNC: DurableObjectNamespace },
  todoId: string,
  userId: string,
  originalText: string,
): Promise<void> {
  const now = new Date();

  // Mark as processing
  await db
    .update(todos)
    .set({ aiStatus: "processing", updatedAt: now })
    .where(eq(todos.id, todoId));

  try {
    const extracted = await extractTodos(ai, originalText);

    // If AI returned nothing useful, mark complete and exit
    if (!extracted || extracted.length === 0) {
      await db
        .update(todos)
        .set({ aiStatus: "complete", updatedAt: new Date() })
        .where(eq(todos.id, todoId));
      return;
    }

    // Use the first extracted item (we no longer support multi-todo extraction)
    const enrichment = extracted[0];
    const updates: Partial<typeof todos.$inferSelect> = {
      aiStatus: "complete",
      updatedAt: new Date(),
    };

    // Update title if AI provided a cleaner one
    if (enrichment.title && enrichment.title !== originalText) {
      updates.title = truncateTitle(enrichment.title);
    }

    // Update due date if extracted
    if (enrichment.dueDate) {
      updates.dueDate = new Date(enrichment.dueDate);
    }

    await db.update(todos).set(updates).where(eq(todos.id, todoId));

    // Handle URLs if extracted
    if (enrichment.urls && enrichment.urls.length > 0) {
      await insertAndFetchUrls(db, todoId, enrichment.urls);
    }

    // Notify clients to refresh
    await notifySync(env, userId);
  } catch (error) {
    console.error("AI enrichment failed for todo:", todoId, error);
    await db
      .update(todos)
      .set({ aiStatus: "failed", updatedAt: new Date() })
      .where(eq(todos.id, todoId));

    // Still notify so UI can show the failed state
    await notifySync(env, userId);
  }
}

/**
 * Insert URL records and fetch metadata in background
 */
async function insertAndFetchUrls(
  db: ReturnType<typeof getDb>,
  todoId: string,
  urls: string[],
): Promise<void> {
  const now = new Date();
  const urlPositions = generateNKeysBetween(null, null, urls.length);

  const urlRecords = urls.map((url, i) => ({
    id: crypto.randomUUID(),
    todoId,
    url,
    position: urlPositions[i],
    fetchStatus: "pending" as const,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(todoUrls).values(urlRecords);

  // Fetch metadata for each URL
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
