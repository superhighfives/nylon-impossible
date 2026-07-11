/**
 * Background AI enrichment for todos
 *
 * Takes an existing todo and enriches it with AI-extracted metadata:
 * - URLs extracted and removed from title
 * - Due date from natural language
 * - Priority if mentioned
 * - Research intent detection (triggers background research)
 *
 * Does NOT rephrase or rewrite the title - only removes URLs.
 */

import * as Sentry from "@sentry/cloudflare";
import { generateNKeysBetween } from "fractional-indexing";
import type { ResearchJobMessage } from "../types";
import { type ConversationTurn, enrichTodo } from "./ai";
import {
  and,
  eq,
  type getDb,
  todoMessages,
  todoResearch,
  todos,
  todoUrls,
} from "./db";
import { truncateTitle } from "./url-helpers";
import { fetchUrlMetadata } from "./url-metadata";

/**
 * Enrich a todo with AI-extracted metadata in the background.
 * Updates the todo in place and notifies connected clients.
 * If research intent is detected, creates a research record and executes research.
 */
export async function enrichOrAskWithAI(
  db: ReturnType<typeof getDb>,
  ai: Ai,
  env: {
    USER_SYNC: DurableObjectNamespace;
    RESEARCH_QUEUE: Queue<ResearchJobMessage>;
    CF_AI_GATEWAY_ID?: string;
    LOG_AI_DEBUG?: string;
  },
  todoId: string,
  userId: string,
  originalText: string,
  userLocation?: string | null,
  history?: ConversationTurn[],
  options?: {
    preserveExistingDueDate?: boolean;
    existingDueDate?: Date | null;
  },
): Promise<void> {
  const now = new Date();

  // Mark as processing
  await db
    .update(todos)
    .set({ aiStatus: "processing", updatedAt: now })
    .where(eq(todos.id, todoId));

  try {
    const enrichment = await enrichTodo(
      ai,
      originalText,
      env.CF_AI_GATEWAY_ID,
      env.LOG_AI_DEBUG === "true",
      history,
    );

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
      let cleanTitle = enrichment.title.trim();
      // If stripping URLs leaves only a single word, append the primary domain
      // so "Research https://google.com" → "Research google.com" instead of just "Research"
      if (
        cleanTitle.split(/\s+/).filter(Boolean).length === 1 &&
        enrichment.urls &&
        enrichment.urls.length > 0
      ) {
        try {
          const domain = new URL(enrichment.urls[0]).hostname.replace(
            /^www\./,
            "",
          );
          cleanTitle = `${cleanTitle} ${domain}`;
        } catch {
          // Invalid URL, skip domain append
        }
      }
      updates.title = truncateTitle(cleanTitle);
    }

    // Update due date if extracted, unless the caller supplied an authoritative
    // one (e.g. a Google Tasks import) that AI shouldn't overwrite.
    if (enrichment.dueDate && !options?.preserveExistingDueDate) {
      updates.dueDate = new Date(enrichment.dueDate);
    }

    // Update priority if extracted
    if (enrichment.priority) {
      updates.priority = enrichment.priority;
    }

    // Subtasks and recurrence are mutually exclusive. If the model returned
    // subtasks, they win — the todo becomes a project, not a repeat.
    const subtaskTitles =
      enrichment.subtasks && enrichment.subtasks.length > 0
        ? enrichment.subtasks
        : null;

    // Update recurrence if extracted. A recurrence rule requires a dueDate
    // anchor: either one freshly extracted here, or one the todo already has
    // (e.g. a Google Tasks import, where we preserve the existing due date and
    // so never populate updates.dueDate). If neither exists, drop the rule —
    // we can't safely guess the user's intended occurrence.
    const recurrenceAnchor = updates.dueDate ?? options?.existingDueDate;
    if (enrichment.recurrence && recurrenceAnchor && !subtaskTitles) {
      updates.recurrence = enrichment.recurrence;
    }

    await db.update(todos).set(updates).where(eq(todos.id, todoId));

    // Notify clients that core AI enrichment is complete
    await notifySync(env, userId);

    // Insert AI-generated subtasks when the todo is a decomposable project.
    // Each subtask is a full child todo positioned within the sibling group.
    // Skip if the todo already has children — re-enrichment (e.g. after a
    // conversation reply) must not duplicate a subtask list.
    if (subtaskTitles) {
      const [existingChild] = await db
        .select({ id: todos.id })
        .from(todos)
        .where(eq(todos.parentId, todoId))
        .limit(1);
      if (!existingChild) {
        const subtaskNow = new Date();
        const positions = generateNKeysBetween(
          null,
          null,
          subtaskTitles.length,
        );
        await db.insert(todos).values(
          subtaskTitles.map((title, i) => ({
            id: crypto.randomUUID(),
            userId,
            parentId: todoId,
            title: truncateTitle(title),
            completed: false,
            position: positions[i],
            createdAt: subtaskNow,
            updatedAt: subtaskNow,
          })),
        );
        await notifySync(env, userId);
      }
    }

    // Handle URLs if extracted
    if (enrichment.urls && enrichment.urls.length > 0) {
      await insertAndFetchUrls(db, todoId, enrichment.urls);
      // Notify again once URL metadata is ready
      await notifySync(env, userId);
    }

    // Handle research if detected
    if (enrichment.research) {
      // A todo can have at most one research row (UNIQUE on todoId). On the
      // initial create there's none, so we insert. On re-enrichment after a
      // reply there may already be one: only replace it when the conversation
      // produced a meaningfully different searchQuery, mirroring the
      // title-change behaviour in updateTodo. Otherwise leave it untouched.
      const [existingResearch] = await db
        .select({
          id: todoResearch.id,
          searchQuery: todoResearch.searchQuery,
        })
        .from(todoResearch)
        .where(eq(todoResearch.todoId, todoId));

      const newQuery = enrichment.searchQuery ?? null;
      const norm = (q: string | null) => (q ?? "").trim().toLowerCase();
      const queryChanged =
        norm(existingResearch?.searchQuery ?? null) !== norm(newQuery);

      // Skip only when we already have research AND the query is unchanged.
      // (queryChanged is always true when there's no existing row.)
      const shouldRunResearch = !existingResearch || queryChanged;

      if (existingResearch && queryChanged) {
        // Drop the stale research and its source URLs before recreating.
        await db
          .delete(todoUrls)
          .where(eq(todoUrls.researchId, existingResearch.id));
        await db
          .delete(todoResearch)
          .where(eq(todoResearch.id, existingResearch.id));
      }

      if (shouldRunResearch) {
        const now = new Date();
        const research = await db
          .insert(todoResearch)
          .values({
            id: crypto.randomUUID(),
            todoId,
            researchType: enrichment.research.type,
            status: "pending",
            searchQuery: newQuery,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .then((r) => r[0]);

        // Notify so clients can show pending research state before long-running work
        await notifySync(env, userId);

        // Enqueue research job — runs in a separate Worker invocation with its own
        // execution budget, not constrained by this waitUntil lifetime
        await env.RESEARCH_QUEUE.send({
          todoId,
          userId,
          // Prefer the LLM-emitted searchQuery — it strips imperatives like
          // "Research" so Tavily searches for the actual topic instead of
          // returning meta-content about researching it.
          query: enrichment.searchQuery ?? originalText,
          researchType: enrichment.research.type,
          researchId: research.id,
          userLocation: userLocation ?? null,
        });
      }
    }

    // Handle a clarifying question if the agent decided to ask one.
    if (enrichment.question) {
      const questionNow = new Date();

      // Enforce "max one open question at a time": clear awaiting_reply on any
      // existing open assistant messages before posting the new one. Guards
      // against concurrent/background runs leaving multiple awaiting messages.
      await db
        .update(todoMessages)
        .set({ awaitingReply: false })
        .where(
          and(
            eq(todoMessages.todoId, todoId),
            eq(todoMessages.awaitingReply, true),
          ),
        );

      await db.insert(todoMessages).values({
        id: crypto.randomUUID(),
        todoId,
        role: "assistant",
        content: enrichment.question,
        createdAt: questionNow,
        awaitingReply: true,
      });

      // Bump the parent todo so the sync cursor picks the message up, and flip
      // needs_input so the list view shows the affordance.
      await db
        .update(todos)
        .set({ needsInput: true, updatedAt: questionNow })
        .where(eq(todos.id, todoId));

      await notifySync(env, userId);
    }
  } catch (error) {
    console.error("AI enrichment failed for todo:", todoId, error);
    Sentry.captureException(error, {
      tags: { area: "ai-enrich" },
      extra: { todoId },
    });
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
  // Skip URLs that are already stored for this todo (e.g. extracted during initial create).
  // Normalize via new URL().href so "https://google.com" and "https://google.com/" compare equal.
  const normalize = (url: string) => {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  };
  const existing = await db
    .select({ url: todoUrls.url })
    .from(todoUrls)
    .where(eq(todoUrls.todoId, todoId));
  const existingUrls = new Set(existing.map((r) => normalize(r.url)));
  const newUrls = urls.filter((url) => !existingUrls.has(normalize(url)));

  if (newUrls.length === 0) return;

  const now = new Date();
  const urlPositions = generateNKeysBetween(null, null, newUrls.length);

  const urlRecords = newUrls.map((url, i) => ({
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
