import { generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import { extractTodos } from "../lib/ai";
import { eq, getDb, todos, todoUrls } from "../lib/db";
import { shouldUseAI } from "../lib/smart-input";
import { fetchUrlMetadata } from "../lib/url-metadata";
import type { Env } from "../types";

const smartCreateSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text is too long"),
});

function serializeTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    title: todo.title,
    description: todo.description,
    completed: todo.completed,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    priority: todo.priority,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

// POST /todos/smart
export async function smartCreate(c: Context<Env>) {
  const body = await c.req.json();
  const parsed = smartCreateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const text = parsed.data.text.trim();
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  // Get the lowest position so new todos are prepended at the start
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows[0]);

  const firstPosition = firstTodo?.position ?? null;

  if (shouldUseAI(text)) {
    // AI path: extract and create multiple todos
    let extracted: Array<{
      title: string;
      urls?: string[];
      dueDate?: string;
    }> | null;

    try {
      extracted = await extractTodos(c.env.AI, c.env.AI_GATEWAY_ID, text);
    } catch (error) {
      // Fallback: create single todo with original text on AI failure
      console.error(
        "AI extraction failed, falling back to single todo:",
        error,
      );
      return createAndReturn(db, c, userId, [{ title: text }], firstPosition);
    }

    // If AI returned null or empty, fall back to single todo
    if (!extracted || extracted.length === 0) {
      return createAndReturn(db, c, userId, [{ title: text }], firstPosition);
    }

    return createAndReturn(db, c, userId, extracted, firstPosition, true);
  }

  // Fast path: create single todo directly
  return createAndReturn(db, c, userId, [{ title: text }], firstPosition);
}

interface ExtractedItem {
  title: string;
  urls?: string[];
  dueDate?: string;
}

/** URL regex to extract URLs from text */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Extract URLs from title text as a fallback when AI misses them.
 * Merges with any AI-extracted URLs, deduplicating.
 */
function ensureUrlsExtracted(item: ExtractedItem): ExtractedItem {
  const urlsInTitle = item.title.match(URL_REGEX) ?? [];
  if (urlsInTitle.length === 0) {
    return item;
  }

  // Merge with existing URLs, avoiding duplicates
  const existingUrls = new Set(item.urls ?? []);
  const allUrls = [...existingUrls];

  for (const url of urlsInTitle) {
    if (!existingUrls.has(url)) {
      allUrls.push(url);
    }
  }

  return {
    ...item,
    urls: allUrls.length > 0 ? allUrls : undefined,
  };
}

/** Batch-insert todos, fetch them back in one query, and return the response. */
async function createAndReturn(
  db: ReturnType<typeof getDb>,
  c: Context<Env>,
  userId: string,
  items: ExtractedItem[],
  firstPosition: string | null,
  ai = false,
) {
  const now = new Date();
  const ids: string[] = [];

  // Ensure URLs are extracted from titles (fallback for when AI misses them)
  const itemsWithUrls = items.map(ensureUrlsExtracted);

  // Generate N positions before the first existing todo
  const positions = generateNKeysBetween(
    null,
    firstPosition,
    itemsWithUrls.length,
  );

  // Build all values up-front so we can batch the insert
  const rows = itemsWithUrls.map((item, i) => {
    const id = crypto.randomUUID();
    ids.push(id);
    return {
      id,
      userId,
      title: item.title,
      completed: false as const,
      position: positions[i],
      dueDate: item.dueDate ? new Date(item.dueDate) : null,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Single batch insert
  await db.insert(todos).values(rows);

  // Collect URLs to insert and fetch metadata for
  const urlsToInsert: Array<{
    id: string;
    todoId: string;
    url: string;
    position: string;
  }> = [];

  itemsWithUrls.forEach((item, i) => {
    if (item.urls && item.urls.length > 0) {
      const todoId = ids[i];
      const urlPositions = generateNKeysBetween(null, null, item.urls.length);
      item.urls.forEach((url, j) => {
        urlsToInsert.push({
          id: crypto.randomUUID(),
          todoId,
          url,
          position: urlPositions[j],
        });
      });
    }
  });

  // Insert URL records if any
  if (urlsToInsert.length > 0) {
    await db.insert(todoUrls).values(
      urlsToInsert.map((u) => ({
        id: u.id,
        todoId: u.todoId,
        url: u.url,
        position: u.position,
        fetchStatus: "pending" as const,
        createdAt: now,
        updatedAt: now,
      })),
    );

    // Fetch metadata in background and update records
    c.executionCtx.waitUntil(
      fetchAndUpdateUrlMetadata(db, urlsToInsert, c.env, userId),
    );
  }

  // Single select to retrieve all created todos (preserves insertion order)
  const created = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .then((all) => {
      const idSet = new Set(ids);
      return all.filter((t) => idSet.has(t.id));
    });

  // Sort to match insertion order
  const idOrder = new Map(ids.map((id, i) => [id, i]));
  created.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  await notifySync(c.env, userId);

  return c.json({ todos: created.map(serializeTodo), ai });
}

/** Fetch metadata for URLs in background and update records */
async function fetchAndUpdateUrlMetadata(
  db: ReturnType<typeof getDb>,
  urls: Array<{ id: string; todoId: string; url: string }>,
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
) {
  const results = await Promise.allSettled(
    urls.map(async ({ id, url }) => {
      try {
        const metadata = await fetchUrlMetadata(url);
        // Update with fetched metadata and mark as fetched
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
          .where(eq(todoUrls.id, id));
        return { id, metadata };
      } catch (error) {
        // Mark as failed on error
        await db
          .update(todoUrls)
          .set({
            fetchStatus: "failed" as const,
            updatedAt: new Date(),
          })
          .where(eq(todoUrls.id, id));
        throw error;
      }
    }),
  );

  // Log any failures for debugging
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(
        `Failed to fetch metadata for ${urls[i].url}:`,
        result.reason,
      );
    }
  });

  // Notify clients that metadata has been updated
  await notifySync(env, userId);
}

/** Notify all connected WebSocket clients for this user to sync */
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
) {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical — clients will sync on next poll
  }
}
