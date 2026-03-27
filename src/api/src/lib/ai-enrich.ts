/**
 * Background AI enrichment for todos
 *
 * Takes an existing todo and enriches it with AI-extracted metadata:
 * - URLs extracted and removed from title
 * - Due date from natural language
 * - Priority if mentioned
 *
 * Does NOT rephrase or rewrite the title - only removes URLs.
 */

import { generateNKeysBetween } from "fractional-indexing";
import { enrichTodo } from "./ai";
import { eq, type getDb, todos, todoUrls } from "./db";
import { truncateTitle } from "./url-helpers";
import { fetchUrlMetadata } from "./url-metadata";

/**
 * Enrich a todo with AI-extracted metadata in the background.
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
    const enrichment = await enrichTodo(ai, originalText);

    // If AI returned nothing useful, mark complete and exit
    if (!enrichment) {
      await db
        .update(todos)
        .set({ aiStatus: "complete", updatedAt: new Date() })
        .where(eq(todos.id, todoId));
      await notifySync(env, userId);
      return;
    }

    const updates: Partial<typeof todos.$inferSelect> = {
      aiStatus: "complete",
      updatedAt: new Date(),
    };

    // Update title if URLs were removed (title changed)
    if (enrichment.title && enrichment.title !== originalText) {
      updates.title = truncateTitle(enrichment.title.trim());
    }

    // Update due date if extracted
    if (enrichment.dueDate) {
      updates.dueDate = new Date(enrichment.dueDate);
    }

    // Update priority if extracted
    if (enrichment.priority) {
      updates.priority = enrichment.priority;
    }

    await db.update(todos).set(updates).where(eq(todos.id, todoId));

    // Notify clients that core AI enrichment is complete
    await notifySync(env, userId);

    // Handle URLs if extracted
    if (enrichment.urls && enrichment.urls.length > 0) {
      await insertAndFetchUrls(db, todoId, enrichment.urls);
      // Notify again once URL metadata is ready
      await notifySync(env, userId);
    }
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
