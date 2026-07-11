import { createClerkClient } from "@clerk/backend";
import { nextDueDate } from "@nylon-impossible/shared/recurrence";
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
  isNotNull,
  lists,
  type Todo,
  type TodoMessage,
  type TodoResearch,
  type TodoUrl,
  todoMessages,
  todoResearch,
  todos,
  todoUrls,
  users,
} from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { extractUrlsFromText, truncateTitle } from "../lib/url-helpers";
import { fetchUrlMetadata } from "../lib/url-metadata";
import type { Env } from "../types";

const DEFAULT_LISTS = ["TODO", "Shopping", "Bills", "Work"];

const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
});

// Sync request schema
const syncRequestSchema = z.object({
  lastSyncedAt: z.union([z.null(), z.coerce.date()]).optional(),
  changes: z.array(
    z.object({
      id: z.string().uuid(),
      // Parent todo id for subtasks; null/absent for top-level todos. Honoured
      // only on create — parentId is immutable, so it is ignored on update.
      parentId: z.string().uuid().nullable().optional(),
      title: z.string().min(1).optional(),
      notes: z.string().max(10000).nullable().optional(),
      completed: z.boolean().optional(),
      position: z.string().optional(),
      dueDate: z.coerce.date().nullable().optional(),
      priority: z.enum(["high", "low"]).nullable().optional(),
      recurrence: recurrenceSchema.nullable().optional(),
      // When a repeat is completed, the client advances dueDate and sends the
      // completion timestamp here (completed stays false). Cleared to null to
      // undo before local midnight.
      completedAt: z.coerce.date().nullable().optional(),
      updatedAt: z.coerce.date(),
      deleted: z.boolean().optional(),
      urls: z
        .array(z.object({ url: z.string().url().max(2048) }))
        .max(10)
        .optional(),
    }),
  ),
});

interface SyncConflict {
  id: string;
  resolution: "local" | "remote";
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
}

function sortChangesForApply(
  changes: Array<(typeof syncRequestSchema)["_output"]["changes"][number]>,
) {
  return changes
    .map((change, originalIndex) => ({ change, originalIndex }))
    .sort((a, b) => {
      const aRank = a.change.parentId ? 1 : 0;
      const bRank = b.change.parentId ? 1 : 0;
      return aRank === bRank
        ? a.originalIndex - b.originalIndex
        : aRank - bRank;
    });
}

// Serialize a URL with explicit ISO8601 dates and lowercase IDs
function serializeUrl(url: TodoUrl) {
  return {
    id: url.id.toLowerCase(),
    todoId: url.todoId.toLowerCase(),
    researchId: url.researchId?.toLowerCase() ?? null,
    url: url.url,
    title: url.title,
    description: url.description,
    siteName: url.siteName,
    favicon: url.favicon,
    image: url.image ?? null,
    position: url.position,
    fetchStatus: url.fetchStatus,
    fetchedAt: url.fetchedAt?.toISOString() ?? null,
    createdAt: url.createdAt.toISOString(),
    updatedAt: url.updatedAt.toISOString(),
  };
}

// Serialize research data
function serializeResearch(research: TodoResearch | null) {
  if (!research) return null;
  return {
    id: research.id.toLowerCase(),
    status: research.status,
    researchType: research.researchType,
    summary: research.summary,
    researchedAt: research.researchedAt?.toISOString() ?? null,
    createdAt: research.createdAt.toISOString(),
    updatedAt: research.updatedAt.toISOString(),
  };
}

// Serialize a conversation message with ISO8601 dates and lowercase IDs
function serializeMessage(m: TodoMessage) {
  return {
    id: m.id.toLowerCase(),
    todoId: m.todoId.toLowerCase(),
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    awaitingReply: m.awaitingReply,
  };
}

// Serialize a todo with explicit ISO8601 dates and lowercase ID
function serializeTodo(
  todo: typeof todos.$inferSelect,
  urls: ReturnType<typeof serializeUrl>[] = [],
  research: TodoResearch | null = null,
  messages: ReturnType<typeof serializeMessage>[] = [],
) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    parentId: todo.parentId?.toLowerCase() ?? null,
    title: todo.title,
    notes: todo.notes,
    completed: todo.completed,
    completedAt: todo.completedAt?.toISOString() ?? null,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    priority: todo.priority,
    recurrence: todo.recurrence,
    aiStatus: todo.aiStatus,
    needsInput: todo.needsInput,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    research: serializeResearch(research),
    messages,
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
            image: metadata.image ?? null,
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
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = syncRequestSchema.safeParse(json.body);

  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
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

    // RETURNING tells us whether THIS call actually inserted the row. The
    // users.email unique index means the insert no-ops when the email already
    // belongs to a different auth id (or when Clerk gave us no email and a
    // prior emailless user already holds the ""). Knowing we inserted lets us
    // seed default lists exactly once — never again on a concurrent-sync race.
    const [inserted] = await db
      .insert(users)
      .values({ id: userId, email })
      .onConflictDoNothing()
      .returning({ id: users.id });

    if (inserted) {
      // We created the user — seed default lists exactly once.
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
    } else {
      // Insert no-op. Either a concurrent sync already created this exact user
      // (fine — proceed), or the email is owned by a *different* account id, in
      // which case this userId has no row and inserting todos would fail the FK.
      // Surface that as a clean 409 instead of a downstream FK crash.
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId));
      if (!existing) {
        return apiError(c, "email_already_registered");
      }
    }
  }

  // Track todos that need URLs stored. explicitUrls takes priority over regex extraction.
  const urlExtractionNeeded: Array<{
    todoId: string;
    explicitUrls?: string[];
    title?: string;
    notes?: string;
  }> = [];

  // 1. Apply client changes (with conflict resolution)
  // Normalize UUIDs to lowercase to match web-generated IDs
  for (const { change, originalIndex } of sortChangesForApply(changes)) {
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
        let nextRecurrence =
          change.recurrence !== undefined
            ? change.recurrence
            : existing.recurrence;
        // Recurrence and subtasks are mutually exclusive. A subtask never
        // recurs, and a todo that has children can't recur. Enforce here so an
        // old or direct client can't reach the illegal state.
        if (nextRecurrence) {
          if (existing.parentId) {
            nextRecurrence = null;
          } else {
            const [child] = await db
              .select({ id: todos.id })
              .from(todos)
              .where(
                and(eq(todos.parentId, normalizedId), eq(todos.userId, userId)),
              )
              .limit(1);
            if (child) nextRecurrence = null;
          }
        }
        const nextDueDateValue =
          change.dueDate !== undefined ? change.dueDate : existing.dueDate;
        const completing =
          change.completed === true && existing.completed === false;
        let dueDateToWrite = nextDueDateValue;
        let completedToWrite = change.completed ?? existing.completed;
        // completedAt tracks a repeat's "done until local midnight" state. The
        // client (iOS) stamps it itself when it advances the anchor locally; the
        // server also stamps it on the completed=true path web uses.
        let completedAtToWrite =
          change.completedAt !== undefined
            ? change.completedAt
            : existing.completedAt;
        // Recurring todo being marked complete: advance the anchor, keep the
        // completion flag clear, and stamp completedAt. Mirrors the optimistic
        // client advance.
        if (completing && nextRecurrence && nextDueDateValue) {
          dueDateToWrite = nextDueDate(
            nextRecurrence,
            nextDueDateValue,
            new Date(),
          );
          completedToWrite = false;
          completedAtToWrite = new Date();
        }
        await db
          .update(todos)
          .set({
            title: change.title ? truncateTitle(change.title) : existing.title,
            notes: change.notes !== undefined ? change.notes : existing.notes,
            completed: completedToWrite,
            completedAt: completedAtToWrite,
            position: change.position ?? existing.position,
            dueDate: dueDateToWrite,
            priority:
              change.priority !== undefined
                ? change.priority
                : existing.priority,
            recurrence: nextRecurrence,
            updatedAt: change.updatedAt,
          })
          .where(eq(todos.id, normalizedId));
        // Completion cascade: toggling a top-level todo's completed flag
        // cascades to its subtasks (checking completes them; unchecking reopens
        // them). Subtasks never recur, so completedAt stays null like ordinary
        // completions. Bumping updatedAt makes children appear in the next pull.
        if (
          !existing.parentId &&
          change.completed !== undefined &&
          change.completed !== existing.completed
        ) {
          await db
            .update(todos)
            .set({ completed: change.completed, updatedAt: change.updatedAt })
            .where(
              and(eq(todos.parentId, normalizedId), eq(todos.userId, userId)),
            );
        }
        if (change.urls && change.urls.length > 0) {
          urlExtractionNeeded.push({
            todoId: normalizedId,
            explicitUrls: change.urls.map((u) => u.url),
          });
        } else if (
          (change.notes && extractUrlsFromText(change.notes).length > 0) ||
          (change.title && extractUrlsFromText(change.title).length > 0)
        ) {
          urlExtractionNeeded.push({
            todoId: normalizedId,
            title: change.title,
            notes: change.notes ?? undefined,
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
        const parentId = change.parentId?.toLowerCase() ?? null;
        if (parentId) {
          const [parent] = await db
            .select({ id: todos.id, parentId: todos.parentId })
            .from(todos)
            .where(and(eq(todos.id, parentId), eq(todos.userId, userId)))
            .limit(1);
          if (!parent || parent.parentId !== null) {
            return apiError(c, "validation_failed", {
              message:
                "parentId must reference one of the user's top-level todos",
              details: [
                {
                  path: ["changes", originalIndex, "parentId"],
                  message:
                    "parentId must reference one of the user's top-level todos",
                },
              ],
            });
          }
        }
        await db.insert(todos).values({
          id: normalizedId,
          userId,
          parentId,
          title: truncateTitle(change.title),
          notes: change.notes ?? null,
          completed: change.completed ?? false,
          completedAt: change.completedAt ?? null,
          position: change.position ?? generateKeyBetween(null, null),
          dueDate: change.dueDate ?? null,
          priority: change.priority ?? null,
          // A subtask never recurs (recurrence is top-level only).
          recurrence: parentId ? null : (change.recurrence ?? null),
          createdAt: change.updatedAt,
          updatedAt: change.updatedAt,
        });
        // Adding a subtask to a recurring parent clears the parent's recurrence
        // (mutually exclusive; the explicit subtask wins). The isNotNull guard
        // means we only write — and bump updatedAt — when there's one to clear.
        if (parentId) {
          await db
            .update(todos)
            .set({ recurrence: null, updatedAt: change.updatedAt })
            .where(
              and(
                eq(todos.id, parentId),
                eq(todos.userId, userId),
                isNotNull(todos.recurrence),
              ),
            );
        }
        if (change.urls && change.urls.length > 0) {
          urlExtractionNeeded.push({
            todoId: normalizedId,
            explicitUrls: change.urls.map((u) => u.url),
          });
        } else if (
          (change.notes && extractUrlsFromText(change.notes).length > 0) ||
          (change.title && extractUrlsFromText(change.title).length > 0)
        ) {
          urlExtractionNeeded.push({
            todoId: normalizedId,
            title: change.title,
            notes: change.notes ?? undefined,
          });
        }
      }
    }
  }

  // 1b. Extract URLs from titles and descriptions (e.g. iOS share sheet stores "URL: https://...")
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

    for (const { todoId, explicitUrls, title, notes } of urlExtractionNeeded) {
      const extractedUrls = explicitUrls
        ? Array.from(new Set(explicitUrls))
        : [
            ...new Set([
              ...(title ? extractUrlsFromText(title) : []),
              ...(notes ? extractUrlsFromText(notes) : []),
            ]),
          ];
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

      if (!explicitUrls && notes) {
        const cleanedNotes = notes
          .replace(
            /URL:\s*https?:\/\/[^\s<>"{}|\\^`[\]]*(?=[)\].,;!?]?\s|$)/gi,
            "",
          )
          .replace(/https?:\/\/[^\s<>"{}|\\^`[\]]*(?=[)\].,;!?]?\s|$)/gi, "")
          .trim();
        await db
          .update(todos)
          .set({ notes: cleanedNotes || null, updatedAt: now })
          .where(eq(todos.id, todoId));
      }
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
  let allResearch: TodoResearch[] = [];
  let allMessages: TodoMessage[] = [];
  if (todoIds.length > 0) {
    [allUrls, allResearch, allMessages] = await Promise.all([
      db
        .select()
        .from(todoUrls)
        .where(inArray(todoUrls.todoId, todoIds))
        .orderBy(asc(todoUrls.position)),
      db
        .select()
        .from(todoResearch)
        .where(inArray(todoResearch.todoId, todoIds)),
      db
        .select()
        .from(todoMessages)
        .where(inArray(todoMessages.todoId, todoIds))
        .orderBy(asc(todoMessages.createdAt)),
    ]);
  }

  // Group URLs by todoId
  const urlsByTodoId = new Map<string, ReturnType<typeof serializeUrl>[]>();
  for (const url of allUrls) {
    const serialized = serializeUrl(url);
    const existing = urlsByTodoId.get(url.todoId) ?? [];
    existing.push(serialized);
    urlsByTodoId.set(url.todoId, existing);
  }

  // Index research by todoId
  const researchByTodoId = new Map<string, TodoResearch>();
  for (const research of allResearch) {
    researchByTodoId.set(research.todoId, research);
  }

  // Group messages by todoId (already ordered by createdAt asc)
  const messagesByTodoId = new Map<
    string,
    ReturnType<typeof serializeMessage>[]
  >();
  for (const message of allMessages) {
    const serialized = serializeMessage(message);
    const existing = messagesByTodoId.get(message.todoId) ?? [];
    existing.push(serialized);
    messagesByTodoId.set(message.todoId, existing);
  }

  return c.json({
    todos: serverTodos.map((todo) =>
      serializeTodo(
        todo,
        urlsByTodoId.get(todo.id) ?? [],
        researchByTodoId.get(todo.id) ?? null,
        messagesByTodoId.get(todo.id) ?? [],
      ),
    ),
    syncedAt: syncedAt.toISOString(),
    conflicts,
  });
}
