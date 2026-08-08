/**
 * Background AI enrichment for todos
 *
 * Takes an existing todo and proposes AI-extracted metadata as suggestions the
 * user accepts or dismisses individually — it does NOT mutate the todo. Each
 * proposal (title cleanup, due date, recurrence, subtasks, research) becomes a
 * `todoSuggestions` row; accepting one applies exactly that change via
 * `applySuggestion` (`handlers/apply-suggestion.ts`), reusing the same
 * validation/normalisation path as a manual edit.
 */

import type {
  SuggestionPayload,
  SuggestionType,
} from "@nylon-impossible/shared/schema";
import * as Sentry from "@sentry/cloudflare";
import { generateNKeysBetween } from "fractional-indexing";
import { type ConversationTurn, enrichTodo } from "./ai";
import {
  and,
  eq,
  type getDb,
  todoMessages,
  todoResearch,
  todoSuggestions,
  todos,
  todoUrls,
} from "./db";
import {
  dueDateSuggestionLabel,
  recurrenceSuggestionLabel,
  researchSuggestionLabel,
  subtasksSuggestionLabel,
  titleSuggestionLabel,
} from "./suggestion-labels";
import { truncateTitle } from "./url-helpers";
import { fetchUrlMetadata } from "./url-metadata";

/**
 * Enrich a todo with AI-extracted metadata in the background. Writes pending
 * suggestions instead of mutating the todo, and notifies connected clients.
 * If research intent is detected and no research exists yet, proposes running
 * it — running research itself only happens once that suggestion is accepted.
 */
export async function enrichOrAskWithAI(
  db: ReturnType<typeof getDb>,
  ai: Ai,
  env: {
    USER_SYNC: DurableObjectNamespace;
    CF_AI_GATEWAY_ID?: string;
    LOG_AI_DEBUG?: string;
  },
  todoId: string,
  userId: string,
  originalText: string,
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

    type NewSuggestion = {
      id: string;
      todoId: string;
      type: SuggestionType;
      payload: SuggestionPayload;
      label: string;
      status: "pending";
      createdAt: Date;
      updatedAt: Date;
    };
    const suggestionNow = new Date();
    const newSuggestions: NewSuggestion[] = [];

    // Propose a title cleanup if URLs were removed (title changed). Does NOT
    // rephrase or rewrite — only removes URLs.
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
      cleanTitle = truncateTitle(cleanTitle);
      newSuggestions.push({
        id: crypto.randomUUID(),
        todoId,
        type: "title",
        payload: { title: cleanTitle },
        label: titleSuggestionLabel(cleanTitle),
        status: "pending",
        createdAt: suggestionNow,
        updatedAt: suggestionNow,
      });
    }

    // Propose a due date if extracted, unless the caller supplied an
    // authoritative one (e.g. a Google Tasks import) that AI shouldn't
    // overwrite even as a suggestion.
    const dueDateForRecurrenceAnchor: Date | null =
      options?.existingDueDate ?? null;
    if (enrichment.dueDate && !options?.preserveExistingDueDate) {
      const proposedDueDate = new Date(enrichment.dueDate);
      newSuggestions.push({
        id: crypto.randomUUID(),
        todoId,
        type: "due_date",
        payload: { dueDate: enrichment.dueDate },
        label: dueDateSuggestionLabel(proposedDueDate),
        status: "pending",
        createdAt: suggestionNow,
        updatedAt: suggestionNow,
      });
    }

    // Subtasks and recurrence are mutually exclusive. If the model returned
    // subtasks, they win — the todo becomes a project, not a repeat. Skip if
    // the todo already has children — re-enrichment (e.g. after a
    // conversation reply) must not duplicate a subtask suggestion.
    const subtaskTitles =
      enrichment.subtasks && enrichment.subtasks.length > 0
        ? enrichment.subtasks
        : null;
    let hasExistingSubtasks = false;
    if (subtaskTitles) {
      const [existingChild] = await db
        .select({ id: todos.id })
        .from(todos)
        .where(eq(todos.parentId, todoId))
        .limit(1);
      hasExistingSubtasks = !!existingChild;
      if (!hasExistingSubtasks) {
        const truncatedTitles = subtaskTitles.map((t) => truncateTitle(t));
        newSuggestions.push({
          id: crypto.randomUUID(),
          todoId,
          type: "subtasks",
          payload: { titles: truncatedTitles },
          label: subtasksSuggestionLabel(truncatedTitles),
          status: "pending",
          createdAt: suggestionNow,
          updatedAt: suggestionNow,
        });
      }
    }

    // A recurrence rule requires a dueDate anchor. Since due dates are now
    // proposed rather than applied, only suggest recurrence when the todo
    // already HAS a real due date (not merely a pending due-date suggestion) —
    // accepting "Repeat weekly" alone must never leave the todo recurring
    // without an anchor. If there's no existing due date, drop the rule; we
    // can't safely guess the user's intended occurrence.
    if (enrichment.recurrence && dueDateForRecurrenceAnchor && !subtaskTitles) {
      newSuggestions.push({
        id: crypto.randomUUID(),
        todoId,
        type: "recurrence",
        payload: { recurrence: enrichment.recurrence },
        label: recurrenceSuggestionLabel(enrichment.recurrence),
        status: "pending",
        createdAt: suggestionNow,
        updatedAt: suggestionNow,
      });
    }

    // Propose research if detected and none exists yet for this todo. A todo
    // can have at most one research row (UNIQUE on todoId); running research
    // is deferred until the suggestion is accepted (handlers/apply-suggestion.ts).
    if (enrichment.research) {
      const [existingResearch] = await db
        .select({ id: todoResearch.id })
        .from(todoResearch)
        .where(eq(todoResearch.todoId, todoId));

      if (!existingResearch) {
        newSuggestions.push({
          id: crypto.randomUUID(),
          todoId,
          type: "research",
          payload: {
            searchQuery: enrichment.searchQuery ?? null,
            researchType: enrichment.research.type,
          },
          label: researchSuggestionLabel(),
          status: "pending",
          createdAt: suggestionNow,
          updatedAt: suggestionNow,
        });
      }
    }

    // Re-running enrich supersedes any suggestions still pending from a prior
    // run — the model has fresh context, so stale proposals shouldn't linger
    // alongside (or instead of) new ones. Suggestions the user already acted
    // on (accepted/dismissed) are untouched history.
    await db
      .delete(todoSuggestions)
      .where(
        and(
          eq(todoSuggestions.todoId, todoId),
          eq(todoSuggestions.status, "pending"),
        ),
      );

    if (newSuggestions.length > 0) {
      await db.insert(todoSuggestions).values(newSuggestions);
    }

    await db
      .update(todos)
      .set({ aiStatus: "complete", updatedAt: new Date() })
      .where(eq(todos.id, todoId));

    // Notify clients that enrichment is complete — suggestion rows arriving
    // (not a timer) is the durable "something to review" signal.
    await notifySync(env, userId);

    // Extracted URLs get their metadata fetched and attached automatically —
    // this is additive preview data, not a field overwrite, so it stays
    // outside the consent flow (unlike title/dueDate/recurrence/subtasks).
    if (enrichment.urls && enrichment.urls.length > 0) {
      await insertAndFetchUrls(db, todoId, enrichment.urls);
      await notifySync(env, userId);
    }

    // Handle a clarifying question if the agent decided to ask one. This
    // channel is unchanged — it's already suggestive (the user has to reply).
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
