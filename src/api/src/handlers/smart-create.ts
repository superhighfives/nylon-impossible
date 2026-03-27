import { generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import { enrichTodoWithAI } from "../lib/ai-enrich";
import { eq, getDb, todos, todoUrls, users } from "../lib/db";
import {
  cleanUrlString,
  createFallbackFromUrl,
  truncateTitle,
} from "../lib/url-helpers";
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
    aiStatus: todo.aiStatus,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

/** URL regex to extract URLs from text */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** Common trailing punctuation that shouldn't be part of URLs */
const TRAILING_PUNCT = /[.,;:!?)]+$/;

/**
 * Create initial todo data from input text.
 * Handles URL-only input specially by extracting domain for title.
 */
function createInitialTodo(text: string): {
  title: string;
  urls?: string[];
} {
  // Check if input is primarily a URL (URL takes up >80% of the text)
  const urlMatch = text.match(URL_REGEX);
  if (urlMatch && urlMatch[0].length > text.length * 0.8) {
    const cleanedUrl = cleanUrlString(urlMatch[0]);
    const fallback = createFallbackFromUrl(cleanedUrl);
    if (fallback) {
      return { title: fallback.title, urls: [fallback.url] };
    }
  }

  // Extract any URLs from text
  const rawMatches = text.match(URL_REGEX) ?? [];
  const urls = rawMatches
    .map((url) => {
      const cleaned = url.replace(TRAILING_PUNCT, "");
      try {
        const parsed = new URL(cleaned);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return parsed.href;
        }
      } catch {
        // Invalid URL, skip
      }
      return null;
    })
    .filter((url): url is string => url !== null);

  // Deduplicate URLs
  const uniqueUrls = Array.from(new Set(urls));

  return {
    title: truncateTitle(text),
    urls: uniqueUrls.length > 0 ? uniqueUrls : undefined,
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

  if (text.length === 0) {
    return c.json({ error: "Text is required" }, 400);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const aiEnabled = c.get("aiEnabled");

  // Get the lowest position so new todo is prepended at the start
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows[0]);

  const position = generateNKeysBetween(
    null,
    firstTodo?.position ?? null,
    1,
  )[0];
  const now = new Date();

  // Create initial todo data
  const initial = createInitialTodo(text);
  const todoId = crypto.randomUUID();

  // Insert todo immediately - this is the fast path
  await db.insert(todos).values({
    id: todoId,
    userId,
    title: initial.title,
    completed: false,
    position,
    aiStatus: aiEnabled ? "pending" : null,
    createdAt: now,
    updatedAt: now,
  });

  // Insert any extracted URLs
  if (initial.urls && initial.urls.length > 0) {
    const urlPositions = generateNKeysBetween(null, null, initial.urls.length);
    await db.insert(todoUrls).values(
      initial.urls.map((url, i) => ({
        id: crypto.randomUUID(),
        todoId,
        url,
        position: urlPositions[i],
        fetchStatus: "pending" as const,
        createdAt: now,
        updatedAt: now,
      })),
    );

    // Fetch URL metadata in background
    c.executionCtx.waitUntil(
      fetchUrlMetadataBackground(db, todoId, c.env, userId),
    );
  }

  // If AI is enabled, enrich in background
  if (aiEnabled) {
    // Fetch user's location for location research context
    const user = await db
      .select({ location: users.location })
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);

    c.executionCtx.waitUntil(
      enrichTodoWithAI(
        db,
        c.env.AI,
        c.env,
        todoId,
        userId,
        text,
        user?.location,
      ),
    );
  }

  // Fetch the created todo to return
  const created = await db
    .select()
    .from(todos)
    .where(eq(todos.id, todoId))
    .then((rows) => rows[0]);

  await notifySync(c.env, userId);

  return c.json({ todos: [serializeTodo(created)], ai: aiEnabled });
}

/** Fetch metadata for URLs in background */
async function fetchUrlMetadataBackground(
  db: ReturnType<typeof getDb>,
  todoId: string,
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  // Get the URL records we just created
  const urlRecords = await db
    .select()
    .from(todoUrls)
    .where(eq(todoUrls.todoId, todoId));

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

  // Notify clients that metadata is ready
  await notifySync(env, userId);
}

/** Notify all connected WebSocket clients for this user to sync */
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical
  }
}
