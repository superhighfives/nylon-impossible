/**
 * Link processing — the non-AI half of "make something of this".
 *
 * Attaching the URLs in a todo's text, fetching what's behind them, and naming
 * the todo after what turned up is all deterministic: it's HTTP and string
 * handling, no model involved. So it runs for everyone regardless of the
 * `aiEnabled` switch, and it's what the explicit "Process" action re-runs when
 * a fetch didn't land the first time.
 *
 * AI (enrich, research) is the other half, and stays opt-in and clearly
 * labelled as such — see `ai-enrich.ts`.
 */

import * as Sentry from "@sentry/cloudflare";
import { generateNKeysBetween } from "fractional-indexing";
import { and, eq, type getDb, inArray, isNull, todos, todoUrls } from "./db";
import { notifySync } from "./notify-sync";
import {
  extractUrlsFromText,
  isPlaceholderTitle,
  titleFromUrlMetadata,
} from "./url-helpers";
import { fetchUrlMetadataResult } from "./url-metadata";

type Db = ReturnType<typeof getDb>;

/** A link row queued for fetching. */
export interface TodoLinkRef {
  id: string;
  todoId: string;
  url: string;
}

/** Compare links by normalized href so a trailing slash isn't a new link. */
function normalizeUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/**
 * Attach any URLs written into a todo's title or notes that aren't stored yet,
 * and flag the links we want (re)fetched as `pending`.
 *
 * Deliberately synchronous in the request that triggers it: flipping rows to
 * `pending` before returning is what gives the client its spinner, since a
 * pending link is the only "working on it" state the sync payload carries.
 * The fetching itself belongs in `fetchTodoLinks`, in the background.
 *
 * `refetch` re-queues links that already have metadata — what an explicit
 * "Process" press means. Without it only links that never landed are retried.
 * Research sources are never touched: they belong to a research run.
 */
export async function queueTodoLinks(
  db: Db,
  todoId: string,
  todo: { title: string; notes: string | null },
  options: { refetch?: boolean } = {},
): Promise<TodoLinkRef[]> {
  const now = new Date();

  const existing = await db
    .select({
      id: todoUrls.id,
      url: todoUrls.url,
      fetchStatus: todoUrls.fetchStatus,
      position: todoUrls.position,
    })
    .from(todoUrls)
    .where(and(eq(todoUrls.todoId, todoId), isNull(todoUrls.researchId)))
    .orderBy(todoUrls.position);

  const seen = new Set(existing.map((row) => normalizeUrl(row.url)));
  const newUrls = [
    ...extractUrlsFromText(todo.title),
    ...extractUrlsFromText(todo.notes ?? ""),
  ].filter((url) => {
    const key = normalizeUrl(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const queued: TodoLinkRef[] = existing
    .filter((row) => options.refetch === true || row.fetchStatus !== "fetched")
    .map((row) => ({ id: row.id, todoId, url: row.url }));

  if (queued.length > 0) {
    await db
      .update(todoUrls)
      .set({ fetchStatus: "pending", updatedAt: now })
      .where(
        inArray(
          todoUrls.id,
          queued.map((link) => link.id),
        ),
      );
  }

  if (newUrls.length > 0) {
    // Positions run after the existing links so a re-process appends rather
    // than shuffling what's already there.
    const positions = generateNKeysBetween(
      existing.at(-1)?.position ?? null,
      null,
      newUrls.length,
    );
    const rows = newUrls.map((url, i) => ({
      id: crypto.randomUUID(),
      todoId,
      url,
      position: positions[i],
      fetchStatus: "pending" as const,
      createdAt: now,
      updatedAt: now,
    }));
    await db.insert(todoUrls).values(rows);
    queued.push(...rows.map((row) => ({ id: row.id, todoId, url: row.url })));
  }

  return queued;
}

/**
 * Fetch metadata for the given links and write it back, marking each `fetched`
 * or `failed`.
 *
 * A page we couldn't reach at all is `failed` — distinct from one that loaded
 * with no usable tags, which is `fetched` with empty metadata. Clients show
 * only the former as something gone wrong, with a retry.
 */
export async function fetchTodoLinks(
  db: Db,
  links: TodoLinkRef[],
): Promise<void> {
  await Promise.allSettled(
    links.map(async ({ id, url }) => {
      const now = new Date();
      try {
        const { ok, metadata } = await fetchUrlMetadataResult(url);
        if (!ok) {
          await db
            .update(todoUrls)
            .set({ fetchStatus: "failed" as const, updatedAt: now })
            .where(eq(todoUrls.id, id));
          return;
        }
        await db
          .update(todoUrls)
          .set({
            title: metadata.title,
            description: metadata.description,
            siteName: metadata.siteName,
            favicon: metadata.favicon,
            image: metadata.image,
            fetchStatus: "fetched" as const,
            fetchedAt: now,
            updatedAt: now,
          })
          .where(eq(todoUrls.id, id));
      } catch (error) {
        Sentry.captureException(error, { tags: { area: "url-metadata" } });
        await db
          .update(todoUrls)
          .set({ fetchStatus: "failed" as const, updatedAt: now })
          .where(eq(todoUrls.id, id));
      }
    }),
  );
}

/**
 * Name a todo after the link it captured.
 *
 * A todo shared in from a browser or an add bar arrives as nothing but a URL,
 * so it carries a placeholder we generated — "Check x.com", or the raw link.
 * Once the fetch says what's actually there, that placeholder is replaced: a
 * tweet becomes its opening line, a page becomes its title. A title the user
 * wrote is never touched, and neither is a placeholder we couldn't improve on.
 *
 * Returns the new title, or null when nothing changed.
 */
export async function applyLinkTitle(
  db: Db,
  todoId: string,
): Promise<string | null> {
  const [todo] = await db
    .select({ title: todos.title })
    .from(todos)
    .where(eq(todos.id, todoId));
  if (!todo) return null;

  const links = await db
    .select({
      url: todoUrls.url,
      title: todoUrls.title,
      description: todoUrls.description,
      siteName: todoUrls.siteName,
      fetchStatus: todoUrls.fetchStatus,
    })
    .from(todoUrls)
    .where(and(eq(todoUrls.todoId, todoId), isNull(todoUrls.researchId)))
    .orderBy(todoUrls.position);

  // Match the placeholder to the link it was generated from, so a todo with
  // several links doesn't get named after the wrong one.
  const source = links.find(
    (link) =>
      link.fetchStatus === "fetched" &&
      isPlaceholderTitle(todo.title, link.url),
  );
  if (!source) return null;

  const derived = titleFromUrlMetadata(source.url, source);
  if (!derived || derived === todo.title) return null;

  await db
    .update(todos)
    .set({ title: derived, updatedAt: new Date() })
    .where(eq(todos.id, todoId));
  return derived;
}

/**
 * Fetch queued links, name their todos after what came back, and poke clients.
 *
 * The tail every link-processing path shares — create, sync, enrich, and the
 * explicit Process action — so a link captured from the share sheet ends up
 * with the same title it would have got from anywhere else.
 */
export async function finishTodoLinks(
  db: Db,
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
  links: TodoLinkRef[],
): Promise<void> {
  if (links.length === 0) return;

  await fetchTodoLinks(db, links);

  // One sync can carry links for many todos, and they don't depend on each
  // other. `allSettled` so a todo that fails to retitle doesn't cost the rest
  // their bump — or everyone the notify below.
  const now = new Date();
  await Promise.allSettled(
    [...new Set(links.map((link) => link.todoId))].map(async (todoId) => {
      const retitled = await applyLinkTitle(db, todoId);
      // applyLinkTitle already bumped the todo when it renamed it. Otherwise the
      // bump is what carries the new link metadata into the next sync pull.
      if (!retitled) {
        await db
          .update(todos)
          .set({ updatedAt: now })
          .where(eq(todos.id, todoId));
      }
    }),
  );

  await notifySync(env, userId);
}
