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
   * Extra URLs to attach beyond those parsed from `text` — e.g. a link the
   * caller wants fetched for metadata. Deduped against parsed URLs; never
   * affects the title.
   */
  extraUrls?: string[];
  /**
   * URLs attached with a title already known, which should NOT be fetched for
   * metadata — e.g. a Gmail thread permalink, where the subject is known up
   * front and a fetch would just hit an auth wall. Stored as already-`fetched`
   * so clients render the title (and their email treatment) immediately.
   * Deduped against parsed URLs and `extraUrls`.
   */
  attachedUrls?: { url: string; title?: string; siteName?: string }[];
  /**
   * Create as a subtask of this todo instead of a top-level todo. Must
   * belong to `userId` and be itself top-level (subtasks can't nest) —
   * mirrors the validation `src/web/src/server/todos.ts`'s own subtask
   * creation already does. Position is scoped to the parent's existing
   * subtasks (prepended) instead of the user's top-level list, and the new
   * todo can never carry a recurrence (recurrence and subtasks are
   * mutually exclusive, enforced elsewhere in `updateTodoCore` too).
   */
  parentId?: string;
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
 * Thrown when `parentId` doesn't resolve to a top-level todo owned by
 * `userId` — either it doesn't exist, belongs to someone else, or is itself
 * a subtask.
 */
export class InvalidParentTodoError extends Error {
  constructor() {
    super("parentId must reference one of the user's top-level todos");
    this.name = "InvalidParentTodoError";
  }
}

/**
 * Core of the smart-create path, shared by the `POST /todos/smart` REST
 * handler, the Gmail add-on, and the todo-agent's `addSubtask` tool. Given a
 * resolved `userId` and free text, it creates a todo (prepended to its list —
 * the user's top-level list, or a parent's subtasks when `parentId` is set),
 * extracts + attaches URLs, optionally kicks off AI enrichment / research in
 * the background, and pokes connected clients to sync. Keeping this in one
 * place means AI/Pro gating, URL handling, positioning, and `notifySync`
 * behave identically everywhere.
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

  const parentId = options.parentId ?? null;
  if (parentId) {
    const [parent] = await db
      .select({ id: todos.id, parentId: todos.parentId })
      .from(todos)
      .where(and(eq(todos.id, parentId), eq(todos.userId, userId)));
    if (!parent || parent.parentId !== null) {
      throw new InvalidParentTodoError();
    }
  }

  // Get the lowest position in the target list so the new todo is prepended:
  // the user's top-level list, or (when parentId is set) that parent's
  // existing subtasks.
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        parentId ? eq(todos.parentId, parentId) : isNull(todos.parentId),
      ),
    )
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
  // URLs we fetch metadata for in the background (parsed from text + plain extras).
  const fetchedUrls = Array.from(new Set([...initial.urls, ...extraUrls]));

  // Pre-titled attachments (e.g. a Gmail thread permalink) skip the fetch: the
  // title is already known and the target sits behind auth. Normalize through
  // the same http/https gate, then dedupe within the group and against the
  // fetched set (via a running `Set`) so a URL never lands in both places.
  const seenUrls = new Set(fetchedUrls);
  const attachedUrls = (options.attachedUrls ?? [])
    .map((a) => {
      const url = normalizeHttpUrl(a.url);
      return url ? { ...a, url } : null;
    })
    .filter(
      (a): a is { url: string; title?: string; siteName?: string } =>
        a !== null,
    )
    .filter((a) => {
      if (seenUrls.has(a.url)) return false;
      seenUrls.add(a.url);
      return true;
    });

  const todoId = crypto.randomUUID();

  // Insert todo immediately - this is the fast path
  await db.insert(todos).values({
    id: todoId,
    userId,
    parentId,
    title: initial.title,
    completed: false,
    position,
    aiStatus: useAI ? "pending" : null,
    createdAt: now,
    updatedAt: now,
  });

  // Insert any URLs — fetched ones start pending, attachments start settled.
  const totalUrls = fetchedUrls.length + attachedUrls.length;
  if (totalUrls > 0) {
    const urlPositions = generateNKeysBetween(null, null, totalUrls);
    await db.insert(todoUrls).values([
      ...fetchedUrls.map((url, i) => ({
        id: crypto.randomUUID(),
        todoId,
        url,
        position: urlPositions[i],
        fetchStatus: "pending" as const,
        createdAt: now,
        updatedAt: now,
      })),
      ...attachedUrls.map((a, i) => ({
        id: crypto.randomUUID(),
        todoId,
        url: a.url,
        title: a.title ?? null,
        siteName: a.siteName ?? null,
        position: urlPositions[fetchedUrls.length + i],
        fetchStatus: "fetched" as const,
        fetchedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    ]);

    // Fetch URL metadata in background — only when there are pending URLs;
    // attachments already carry their title and must not be re-fetched.
    if (fetchedUrls.length > 0) {
      options.waitUntil(fetchUrlMetadataBackground(db, todoId, env, userId));
    }
  }

  // If AI is enabled, enrich in background
  if (useAI) {
    options.waitUntil(
      enrichOrAskWithAI(db, env.AI, env, todoId, userId, trimmed),
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
  // Get the pending URL records we just created — attachments (e.g. a Gmail
  // permalink) are inserted already `fetched` and must not be fetched over.
  const urlRecords = await db
    .select()
    .from(todoUrls)
    .where(
      and(eq(todoUrls.todoId, todoId), eq(todoUrls.fetchStatus, "pending")),
    );

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
