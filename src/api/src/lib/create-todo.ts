import * as Sentry from "@sentry/cloudflare";
import { generateNKeysBetween } from "fractional-indexing";
import type { Env, ResearchJobMessage } from "../types";
import { enrichOrAskWithAI } from "./ai-enrich";
import {
  and,
  eq,
  type getDb,
  isNull,
  todoResearch,
  todos,
  todoUrls,
  users,
} from "./db";
import { notifySync } from "./notify-sync";
import {
  cleanUrlString,
  createFallbackFromUrl,
  truncateTitle,
} from "./url-helpers";
import { fetchUrlMetadata } from "./url-metadata";

type Db = ReturnType<typeof getDb>;
type Bindings = Env["Bindings"];

/** Serialized todo shape returned by the smart-create path. */
export function serializeCreatedTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    parentId: todo.parentId?.toLowerCase() ?? null,
    title: todo.title,
    notes: todo.notes,
    completed: todo.completed,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    priority: todo.priority,
    recurrence: todo.recurrence,
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
 * Normalize a raw URL string to an `http:`/`https:` href, or null if it's not a
 * valid web URL. This is the single gate every URL we persist passes through, so
 * a `javascript:`/`data:` (or otherwise malformed) value can never reach the
 * `todoUrls.url` column and later render as a clickable link.
 */
function normalizeHttpUrl(raw: string): string | null {
  const cleaned = raw.replace(TRAILING_PUNCT, "");
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Invalid URL, skip
  }
  return null;
}

/**
 * Create initial todo data from input text.
 * Handles URL-only input specially by extracting domain for title.
 */
function createInitialTodo(text: string): {
  title: string;
  urls: string[];
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
    .map(normalizeHttpUrl)
    .filter((url): url is string => url !== null);

  return {
    title: truncateTitle(text),
    urls: Array.from(new Set(urls)),
  };
}

export interface CreateSmartTodoOptions {
  /** Master AI switch for the user (from `users.aiEnabled`). */
  aiEnabled: boolean;
  /** Run the enrichment model (which may in turn trigger research). */
  enrich?: boolean;
  /** Run research directly (independent of the enrichment model). */
  research?: boolean;
  /**
   * Extra URLs to attach beyond those parsed from `text` — e.g. the Gmail
   * thread permalink when adding a todo from a message. Deduped against parsed
   * URLs; never affects the title.
   */
  extraUrls?: string[];
  /**
   * Schedule background work (URL metadata fetch, AI enrichment). In a Worker
   * request this is `c.executionCtx.waitUntil`. Callers with no execution
   * context can pass a function that awaits or ignores the promise.
   */
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface CreateSmartTodoResult {
  todo: ReturnType<typeof serializeCreatedTodo>;
  ai: boolean;
}

/**
 * Core of the smart-create path, shared by the `POST /todos/smart` REST
 * handler and the Gmail add-on. Given a resolved `userId` and free text, it
 * creates a top-level todo (prepended to the list), extracts + attaches URLs,
 * optionally kicks off AI enrichment / research in the background, and pokes
 * connected clients to sync. Keeping this in one place means AI/Pro gating,
 * URL handling, positioning, and `notifySync` behave identically everywhere.
 */
export async function createSmartTodo(
  db: Db,
  env: Bindings,
  userId: string,
  text: string,
  options: CreateSmartTodoOptions,
): Promise<CreateSmartTodoResult> {
  const trimmed = text.trim();

  // AI is intentional: it only runs when the caller explicitly asks for it, and
  // only while the user's `aiEnabled` master switch is on. Plan does not gate
  // AI — it's available to anyone with AI turned on.
  const useAI = options.enrich === true && options.aiEnabled;
  // Explicit research runs independently of the enrichment model's own
  // detection. When enrich is also requested, let enrichment decide (it can
  // trigger research itself) so we don't double-run.
  const doResearch = options.research === true && options.aiEnabled && !useAI;

  // Get the lowest top-level position so the new todo is prepended at the start
  // of the top-level list (subtasks order within their own sibling group, so
  // exclude them here).
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(and(eq(todos.userId, userId), isNull(todos.parentId)))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows[0]);

  const position = generateNKeysBetween(
    null,
    firstTodo?.position ?? null,
    1,
  )[0];
  const now = new Date();

  const initial = createInitialTodo(trimmed);

  // Merge any caller-supplied URLs (e.g. a Gmail thread permalink) with those
  // parsed from the text, keeping order (parsed first) and deduping. extraUrls
  // passes the same http/https gate as parsed URLs — a caller-supplied value is
  // untrusted input, so a `javascript:`/`data:` string can't slip through to a
  // persisted, clickable link.
  const extraUrls = (options.extraUrls ?? [])
    .map(normalizeHttpUrl)
    .filter((url): url is string => url !== null);
  const urls = Array.from(new Set([...initial.urls, ...extraUrls]));

  const todoId = crypto.randomUUID();

  // Insert todo immediately - this is the fast path
  await db.insert(todos).values({
    id: todoId,
    userId,
    title: initial.title,
    completed: false,
    position,
    aiStatus: useAI ? "pending" : null,
    createdAt: now,
    updatedAt: now,
  });

  // Insert any URLs
  if (urls.length > 0) {
    const urlPositions = generateNKeysBetween(null, null, urls.length);
    await db.insert(todoUrls).values(
      urls.map((url, i) => ({
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
    options.waitUntil(fetchUrlMetadataBackground(db, todoId, env, userId));
  }

  // If AI is enabled, enrich in background
  if (useAI) {
    // Fetch user's location for location research context
    const user = await db
      .select({ location: users.location })
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);

    options.waitUntil(
      enrichOrAskWithAI(
        db,
        env.AI,
        env,
        todoId,
        userId,
        trimmed,
        user?.location,
      ),
    );
  }

  // Explicit research requested at creation (without enrich): create a pending
  // research record and enqueue it directly, using the todo title as the query.
  if (doResearch) {
    const researchId = crypto.randomUUID();
    await db.insert(todoResearch).values({
      id: researchId,
      todoId,
      researchType: "general",
      status: "pending",
      searchQuery: null,
      createdAt: now,
      updatedAt: now,
    });

    const user = await db
      .select({ location: users.location })
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);

    await env.RESEARCH_QUEUE.send({
      todoId,
      userId,
      query: initial.title,
      researchType: "general",
      researchId,
      userLocation: user?.location ?? null,
    } satisfies ResearchJobMessage);
  }

  // Fetch the created todo to return
  const created = await db
    .select()
    .from(todos)
    .where(eq(todos.id, todoId))
    .then((rows) => rows[0]);

  Sentry.addBreadcrumb({
    category: "todo",
    message: "todo.created",
    data: { method: "smart" },
    level: "info",
  });

  await notifySync(env, userId);

  return { todo: serializeCreatedTodo(created), ai: useAI };
}

/** Fetch metadata for URLs in background */
async function fetchUrlMetadataBackground(
  db: Db,
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
            image: metadata.image,
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

  // Notify clients that metadata is ready
  await notifySync(env, userId);
}
