import { createClerkClient } from "@clerk/backend";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  and,
  asc,
  eq,
  getDb,
  gt,
  inArray,
  lists,
  type Todo,
  type TodoUrl,
  todos,
  todoUrls,
  users,
} from "../lib/db";
import { extractUrlsFromText, truncateTitle } from "../lib/url-helpers";
import { fetchUrlMetadata } from "../lib/url-metadata";
import type { Env } from "../types";

const DEFAULT_LISTS = ["TODO", "Shopping", "Bills", "Work"];

// Sync request schema
const syncRequestSchema = z.object({
  lastSyncedAt: z.union([z.null(), z.coerce.date()]).optional(),
  changes: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      description: z.string().max(10000).nullable().optional(),
      completed: z.boolean().optional(),
      position: z.string().optional(),
      dueDate: z.coerce.date().nullable().optional(),
      priority: z.enum(["high", "low"]).nullable().optional(),
      updatedAt: z.coerce.date(),
      deleted: z.boolean().optional(),
    }),
  ),
});

interface SyncConflict {
  id: string;
  resolution: "local" | "remote";
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
}

// Serialize a URL with explicit ISO8601 dates and lowercase IDs
function serializeUrl(url: TodoUrl) {
  return {
    id: url.id.toLowerCase(),
    todoId: url.todoId.toLowerCase(),
    url: url.url,
    title: url.title,
    description: url.description,
    siteName: url.siteName,
    favicon: url.favicon,
    position: url.position,
    fetchStatus: url.fetchStatus,
    fetchedAt: url.fetchedAt?.toISOString() ?? null,
    createdAt: url.createdAt.toISOString(),
    updatedAt: url.updatedAt.toISOString(),
  };
}

// Serialize a todo with explicit ISO8601 dates and lowercase ID
function serializeTodo(
  todo: typeof todos.$inferSelect,
  urls: ReturnType<typeof serializeUrl>[] = [],
) {
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
    urls,
  };
}

/** Fetch metadata for URLs in background and update records */
async function fetchAndUpdateUrlMetadata(
  db: ReturnType<typeof getDb>,
  urls: Array<{ id: string; todoId: string; url: string }>,
) {
  await Promise.allSettled(
    urls.map(async ({ id, todoId, url }) => {
      const now = new Date();
      try {
        const metadata = await fetchUrlMetadata(url);
        await db
          .update(todoUrls)
          .set({
            title: metadata.title,
            description: metadata.description,
            siteName: metadata.siteName,
            favicon: metadata.favicon,
            fetchStatus: "fetched" as const,
            fetchedAt: now,
            updatedAt: now,
          })
          .where(eq(todoUrls.id, id));
      } catch {
        await db
          .update(todoUrls)
          .set({ fetchStatus: "failed" as const, updatedAt: now })
          .where(eq(todoUrls.id, id));
      }
      // Bump parent todo so clients receive updated URL metadata on next sync
      await db
        .update(todos)
        .set({ updatedAt: now })
        .where(eq(todos.id, todoId));
    }),
  );
}

// POST /todos/sync - Bidirectional sync
export async function syncTodos(c: Context<Env>) {
  const body = await c.req.json();
  const parsed = syncRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const { lastSyncedAt, changes } = parsed.data;
  const userId = c.get("userId");
  const db = getDb(c.env.DB);
  const conflicts: SyncConflict[] = [];
  const syncedAt = new Date();

  // Ensure user exists before inserting todos (FK constraint)
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  if (!existingUser) {
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

    await db.insert(users).values({ id: userId, email }).onConflictDoNothing();

    // Seed default lists for new user
    const positions = generateNKeysBetween(null, null, DEFAULT_LISTS.length);
    const now = new Date();
    await db.insert(lists).values(
      DEFAULT_LISTS.map((name, i) => ({
        id: crypto.randomUUID(),
        userId,
        name,
        position: positions[i],
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  // Track todos whose descriptions contain URLs that need extracting
  const urlExtractionNeeded: Array<{ todoId: string; description: string }> =
    [];

  // 1. Apply client changes (with conflict resolution)
  // Normalize UUIDs to lowercase to match web-generated IDs
  for (const change of changes) {
    const normalizedId = change.id.toLowerCase();

    const [existing] = await db
      .select()
      .from(todos)
      .where(and(eq(todos.id, normalizedId), eq(todos.userId, userId)));

    if (change.deleted) {
      // Delete if exists and owned by user
      if (existing) {
        // Last write wins for deletes too
        if (change.updatedAt >= existing.updatedAt) {
          await db.delete(todos).where(eq(todos.id, normalizedId));
        } else {
          conflicts.push({
            id: normalizedId,
            resolution: "remote",
            localUpdatedAt: change.updatedAt,
            remoteUpdatedAt: existing.updatedAt,
          });
        }
      }
      // If doesn't exist, nothing to delete
    } else if (existing) {
      // Update existing - last write wins
      if (change.updatedAt >= existing.updatedAt) {
        await db
          .update(todos)
          .set({
            title: change.title ? truncateTitle(change.title) : existing.title,
            description:
              change.description !== undefined
                ? change.description
                : existing.description,
            completed: change.completed ?? existing.completed,
            position: change.position ?? existing.position,
            dueDate:
              change.dueDate !== undefined ? change.dueDate : existing.dueDate,
            priority:
              change.priority !== undefined
                ? change.priority
                : existing.priority,
            updatedAt: change.updatedAt,
          })
          .where(eq(todos.id, normalizedId));
        if (
          change.description &&
          extractUrlsFromText(change.description).length > 0
        ) {
          urlExtractionNeeded.push({
            todoId: normalizedId,
            description: change.description,
          });
        }
      } else {
        conflicts.push({
          id: normalizedId,
          resolution: "remote",
          localUpdatedAt: change.updatedAt,
          remoteUpdatedAt: existing.updatedAt,
        });
      }
    } else {
      // Create new
      if (change.title) {
        await db.insert(todos).values({
          id: normalizedId,
          userId,
          title: truncateTitle(change.title),
          description: change.description ?? null,
          completed: change.completed ?? false,
          position: change.position ?? generateKeyBetween(null, null),
          dueDate: change.dueDate ?? null,
          priority: change.priority ?? null,
          createdAt: change.updatedAt,
          updatedAt: change.updatedAt,
        });
        if (
          change.description &&
          extractUrlsFromText(change.description).length > 0
        ) {
          urlExtractionNeeded.push({
            todoId: normalizedId,
            description: change.description,
          });
        }
      }
    }
  }

  // 1b. Extract URLs from descriptions (e.g. iOS share sheet stores "URL: https://...")
  if (urlExtractionNeeded.length > 0) {
    const now = new Date();
    const urlsToFetch: Array<{ id: string; todoId: string; url: string }> = [];

    // Batch-fetch all existing URLs for all todos in one query
    const extractionTodoIds = urlExtractionNeeded.map((t) => t.todoId);
    const existingUrlRows = await db
      .select({
        todoId: todoUrls.todoId,
        url: todoUrls.url,
        position: todoUrls.position,
      })
      .from(todoUrls)
      .where(inArray(todoUrls.todoId, extractionTodoIds))
      .orderBy(asc(todoUrls.position));

    // Group by todoId for O(1) lookup
    const existingByTodo = new Map<
      string,
      { urls: Set<string>; lastPosition: string | null }
    >();
    for (const row of existingUrlRows) {
      let entry = existingByTodo.get(row.todoId);
      if (!entry) {
        entry = { urls: new Set(), lastPosition: null };
        existingByTodo.set(row.todoId, entry);
      }
      entry.urls.add(row.url);
      entry.lastPosition = row.position; // rows are ordered, so last wins
    }

    for (const { todoId, description } of urlExtractionNeeded) {
      const extractedUrls = extractUrlsFromText(description);
      if (extractedUrls.length === 0) continue;

      const existing = existingByTodo.get(todoId) ?? {
        urls: new Set(),
        lastPosition: null,
      };
      const newUrls = extractedUrls.filter((url) => !existing.urls.has(url));
      if (newUrls.length === 0) continue;

      // Generate positions after the last existing position to avoid collisions
      const urlPositions = generateNKeysBetween(
        existing.lastPosition,
        null,
        newUrls.length,
      );
      const urlRows = newUrls.map((url, i) => {
        const id = crypto.randomUUID();
        urlsToFetch.push({ id, todoId, url });
        return {
          id,
          todoId,
          url,
          position: urlPositions[i],
          fetchStatus: "pending" as const,
          createdAt: now,
          updatedAt: now,
        };
      });
      await db.insert(todoUrls).values(urlRows);

      // Clear the description now that URLs have been extracted
      const cleanedDescription = description
        .replace(
          /URL:\s*https?:\/\/[^\s<>"{}|\\^`[\]]*(?=[)\].,;!?]?\s|$)/gi,
          "",
        )
        .replace(/https?:\/\/[^\s<>"{}|\\^`[\]]*(?=[)\].,;!?]?\s|$)/gi, "")
        .trim();
      await db
        .update(todos)
        .set({ description: cleanedDescription || null, updatedAt: now })
        .where(eq(todos.id, todoId));
    }

    if (urlsToFetch.length > 0) {
      c.executionCtx.waitUntil(fetchAndUpdateUrlMetadata(db, urlsToFetch));
    }
  }

  // 2. Fetch all todos updated since lastSyncedAt (or all if first sync)
  let serverTodos: Todo[];
  if (lastSyncedAt) {
    serverTodos = await db
      .select()
      .from(todos)
      .where(and(eq(todos.userId, userId), gt(todos.updatedAt, lastSyncedAt)))
      .orderBy(todos.createdAt);
  } else {
    serverTodos = await db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(todos.createdAt);
  }

  // 3. Fetch all URLs for the returned todos
  const todoIds = serverTodos.map((t) => t.id);
  let allUrls: TodoUrl[] = [];
  if (todoIds.length > 0) {
    allUrls = await db
      .select()
      .from(todoUrls)
      .where(inArray(todoUrls.todoId, todoIds))
      .orderBy(asc(todoUrls.position));
  }

  // Group URLs by todoId
  const urlsByTodoId = new Map<string, ReturnType<typeof serializeUrl>[]>();
  for (const url of allUrls) {
    const serialized = serializeUrl(url);
    const existing = urlsByTodoId.get(url.todoId) ?? [];
    existing.push(serialized);
    urlsByTodoId.set(url.todoId, existing);
  }

  return c.json({
    todos: serverTodos.map((todo) =>
      serializeTodo(todo, urlsByTodoId.get(todo.id) ?? []),
    ),
    syncedAt: syncedAt.toISOString(),
    conflicts,
  });
}
