import {
  TEXT_URL_PATTERN,
  TODO_NOTES_MAX,
  toDueDay,
} from "@nylon-impossible/shared";
import { chunkForD1 } from "@nylon-impossible/shared/d1";
import {
  getSystemListId,
  getUserTimezone,
  verifyListOwnership,
} from "@nylon-impossible/shared/queries";
import { placementForDueDate } from "@nylon-impossible/shared/recurrence";
import {
  loadUrlsByTodoId,
  serializeTodo,
  serializeUrl,
} from "@nylon-impossible/shared/serialize";
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
  type Todo,
  todos,
  todoUrls,
} from "../lib/db";
import { ensureUser } from "../lib/ensure-user";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { listIdSchema } from "../lib/list-id";
import { pinnedRequestFields, resolvePinned } from "../lib/pinned";
import { finishTodoLinks } from "../lib/process-todo";
import {
  cascadeCompletion,
  effectiveRecurrence,
  rollForward,
} from "../lib/todos-core";
import { extractUrlsFromText, truncateTitle } from "../lib/url-helpers";
import type { Env } from "../types";

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
      notes: z.string().max(TODO_NOTES_MAX).nullable().optional(),
      completed: z.boolean().optional(),
      position: z.string().optional(),
      // Normalized to UTC midnight — due dates are calendar days.
      dueDate: z.coerce.date().transform(toDueDay).nullable().optional(),
      recurrence: recurrenceSchema.nullable().optional(),
      // When a repeat is completed, the client advances dueDate and sends the
      // completion timestamp here (completed stays false). Cleared to null to
      // undo before local midnight.
      completedAt: z.coerce.date().nullable().optional(),
      updatedAt: z.coerce.date(),
      deleted: z.boolean().optional(),
      ...pinnedRequestFields,
      listId: listIdSchema.optional(),
      urls: z
        .array(z.object({ url: z.string().url().max(2048) }))
        .max(10)
        .optional(),
    }),
  ),
});

// What the notes clean-up strips once a todo's links are stored: a URL (or an
// iOS share sheet's "URL: …" line) ending at whitespace or the end of the
// notes, with at most one closing punctuation mark before it.
const NOTES_URL_END = String.raw`(?=[)\].,;!?]?\s|$)`;
const NOTES_PREFIXED_URL_REGEX = new RegExp(
  String.raw`URL:\s*${TEXT_URL_PATTERN}*${NOTES_URL_END}`,
  "gi",
);
const NOTES_URL_REGEX = new RegExp(
  `${TEXT_URL_PATTERN}*${NOTES_URL_END}`,
  "gi",
);

type SyncChange = (typeof syncRequestSchema)["_output"]["changes"][number];

interface SyncConflict {
  id: string;
  resolution: "local" | "remote";
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
}

/** A change older than the stored todo loses to it (last write wins). */
function remoteWins(
  id: string,
  change: SyncChange,
  existing: Todo,
): SyncConflict {
  return {
    id,
    resolution: "remote",
    localUpdatedAt: change.updatedAt,
    remoteUpdatedAt: existing.updatedAt,
  };
}

/** A todo whose links need storing. explicitUrls takes priority over regex extraction. */
interface UrlExtraction {
  todoId: string;
  explicitUrls?: string[];
  title?: string;
  notes?: string;
}

/**
 * Queue a todo's links for storing: the change's explicit `urls`, or else any
 * found in its title or notes.
 */
function queueUrls(list: UrlExtraction[], todoId: string, change: SyncChange) {
  if (change.urls && change.urls.length > 0) {
    list.push({ todoId, explicitUrls: change.urls.map((u) => u.url) });
  } else if (
    (change.notes && extractUrlsFromText(change.notes).length > 0) ||
    (change.title && extractUrlsFromText(change.title).length > 0)
  ) {
    list.push({
      todoId,
      title: change.title,
      notes: change.notes ?? undefined,
    });
  }
}

function sortChangesForApply(changes: SyncChange[]) {
  const getRank = (parentId: string | null | undefined) => (parentId ? 1 : 0);
  return changes
    .map((change, originalIndex) => ({ change, originalIndex }))
    .sort((a, b) => {
      const aRank = getRank(a.change.parentId);
      const bRank = getRank(b.change.parentId);
      return aRank === bRank
        ? a.originalIndex - b.originalIndex
        : aRank - bRank;
    });
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
  // Looked up at most once per batch — only repeating todos need it.
  let userTimeZone: string | undefined;
  const timeZoneForUser = async () =>
    (userTimeZone ??= await getUserTimezone(db, userId));

  // Ensure user exists before inserting todos (FK constraint). Shared with
  // /users/me so both entry points provision identically.
  if ((await ensureUser(c.env, db, userId)) === "email_conflict") {
    return apiError(c, "email_already_registered");
  }

  // Track todos that need URLs stored.
  const urlExtractionNeeded: UrlExtraction[] = [];

  // 1. Apply client changes (with conflict resolution)
  // Normalize UUIDs to lowercase to match web-generated IDs
  for (const { change, originalIndex: changeIndex } of sortChangesForApply(
    changes,
  )) {
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
          conflicts.push(remoteWins(normalizedId, change, existing));
        }
      }
      // If doesn't exist, nothing to delete
    } else if (existing) {
      // Update existing - last write wins
      if (change.updatedAt >= existing.updatedAt) {
        const nextRecurrence = await effectiveRecurrence(
          db,
          userId,
          existing,
          change.recurrence !== undefined
            ? change.recurrence
            : existing.recurrence,
        );
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
        let recurrencePlacementListId: string | null = null;
        if (completing && nextRecurrence && nextDueDateValue) {
          const next = await rollForward(db, userId, {
            recurrence: nextRecurrence,
            dueDate: nextDueDateValue,
            now: new Date(),
            timeZone: await timeZoneForUser(),
          });
          dueDateToWrite = next.dueDate;
          completedToWrite = false;
          completedAtToWrite = next.completedAt;
          // The new occurrence goes where placement puts it, unless the client
          // also explicitly moved it in this same change, which wins.
          if (change.listId === undefined) {
            recurrencePlacementListId = next.listId;
          }
        }
        // Completing a pinned todo unpins it, same as the Gmail add-on's
        // `setTodoCompleted` and the web's server functions.
        let pinnedToWrite = resolvePinned(change) ?? existing.pinned;
        if (completing && pinnedToWrite) pinnedToWrite = false;
        // A client-supplied listId only ever passes a UUID-format check at
        // the request boundary — verify it actually belongs to this user
        // before writing it, or a leaked/guessed list id from another
        // account could be pointed at by this todo, and deleting that list
        // would cascade-delete it.
        const ownedListId =
          change.listId !== undefined
            ? await verifyListOwnership(db, userId, change.listId)
            : undefined;
        if (change.listId !== undefined && !ownedListId) {
          return apiError(c, "list_not_found");
        }
        const listIdToWrite =
          ownedListId ?? recurrencePlacementListId ?? existing.listId;
        const listChanged = listIdToWrite !== existing.listId;
        await db
          .update(todos)
          .set({
            title: change.title ? truncateTitle(change.title) : existing.title,
            notes: change.notes !== undefined ? change.notes : existing.notes,
            completed: completedToWrite,
            completedAt: completedAtToWrite,
            position: change.position ?? existing.position,
            dueDate: dueDateToWrite,
            recurrence: nextRecurrence,
            pinned: pinnedToWrite,
            listId: listIdToWrite,
            listEnteredAt: listChanged
              ? change.updatedAt
              : existing.listEnteredAt,
            updatedAt: change.updatedAt,
          })
          .where(eq(todos.id, normalizedId));
        if (
          !existing.parentId &&
          change.completed !== undefined &&
          change.completed !== existing.completed
        ) {
          await cascadeCompletion(
            db,
            userId,
            normalizedId,
            change.completed,
            change.updatedAt,
          );
        }
        queueUrls(urlExtractionNeeded, normalizedId, change);
      } else {
        conflicts.push(remoteWins(normalizedId, change, existing));
      }
    } else {
      // Create new
      if (change.title) {
        const parentId = change.parentId?.toLowerCase() ?? null;
        let parentListId: string | null = null;
        if (parentId) {
          const [parentTodo] = await db
            .select({
              id: todos.id,
              parentId: todos.parentId,
              listId: todos.listId,
            })
            .from(todos)
            .where(and(eq(todos.id, parentId), eq(todos.userId, userId)))
            .limit(1);
          if (!parentTodo || parentTodo.parentId !== null) {
            return apiError(c, "validation_failed", {
              message:
                "parentId must reference one of the user's top-level todos",
              details: [
                {
                  path: ["changes", changeIndex, "parentId"],
                  message:
                    "parentId must reference one of the user's top-level todos",
                },
              ],
            });
          }
          parentListId = parentTodo.listId;
        }
        // Subtasks are implicitly scoped to their parent's list — no
        // independent list membership. A new recurring todo (which always
        // has a due date) is placed by that due date's distance instead of
        // defaulting to Today. Other top-level todos default to Today.
        const isRecurring = !parentId && change.recurrence && change.dueDate;
        // A client-supplied listId only ever passes a UUID-format check at
        // the request boundary — verify ownership before writing it.
        const ownedCreateListId = change.listId
          ? await verifyListOwnership(db, userId, change.listId)
          : null;
        if (change.listId && !ownedCreateListId) {
          return apiError(c, "list_not_found");
        }
        const listId =
          parentListId ??
          ownedCreateListId ??
          (isRecurring && change.dueDate
            ? await getSystemListId(
                db,
                userId,
                placementForDueDate(
                  change.dueDate,
                  new Date(),
                  await timeZoneForUser(),
                ),
              )
            : null) ??
          (await getSystemListId(db, userId, "today"));
        if (!listId) {
          return apiError(c, "list_not_found");
        }
        await db.insert(todos).values({
          id: normalizedId,
          userId,
          parentId,
          listId,
          listEnteredAt: change.updatedAt,
          title: truncateTitle(change.title),
          notes: change.notes ?? null,
          completed: change.completed ?? false,
          completedAt: change.completedAt ?? null,
          position: change.position ?? generateKeyBetween(null, null),
          dueDate: change.dueDate ?? null,
          // A subtask never recurs (recurrence is top-level only).
          recurrence: parentId ? null : (change.recurrence ?? null),
          pinned: resolvePinned(change) ?? false,
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
        queueUrls(urlExtractionNeeded, normalizedId, change);
      }
    }
  }

  // 1b. Extract URLs from titles and descriptions (e.g. iOS share sheet stores "URL: https://...")
  if (urlExtractionNeeded.length > 0) {
    const now = new Date();
    const urlsToFetch: Array<{ id: string; todoId: string; url: string }> = [];

    // Batch-fetch all existing URLs for these todos, chunked to stay within
    // D1's bound-param cap (a large import can need URL extraction for far more
    // than 100 todos at once).
    const extractionTodoIds = urlExtractionNeeded.map((t) => t.todoId);
    const existingUrlRows: {
      todoId: string;
      url: string;
      position: string;
    }[] = [];
    for (const chunkIds of chunkForD1(extractionTodoIds)) {
      const rows = await db
        .select({
          todoId: todoUrls.todoId,
          url: todoUrls.url,
          position: todoUrls.position,
        })
        .from(todoUrls)
        .where(inArray(todoUrls.todoId, chunkIds))
        .orderBy(asc(todoUrls.position));
      existingUrlRows.push(...rows);
    }

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
          .replace(NOTES_PREFIXED_URL_REGEX, "")
          .replace(NOTES_URL_REGEX, "")
          .trim();
        await db
          .update(todos)
          .set({ notes: cleanedNotes || null, updatedAt: now })
          .where(eq(todos.id, todoId));
      }
    }

    if (urlsToFetch.length > 0) {
      // Fetching bumps each parent todo so the new metadata lands on the next
      // pull, and renames any todo still carrying a "Check {domain}"
      // placeholder — which is how a link shared in from the iOS share sheet
      // ends up titled after the page rather than its domain.
      c.executionCtx.waitUntil(finishTodoLinks(db, c.env, userId, urlsToFetch));
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
  const urlsByTodoId = await loadUrlsByTodoId(
    db,
    serverTodos.map((t) => t.id),
  );

  return c.json({
    todos: serverTodos.map((todo) => ({
      ...serializeTodo(todo),
      urls: (urlsByTodoId.get(todo.id.toLowerCase()) ?? []).map(serializeUrl),
    })),
    syncedAt: syncedAt.toISOString(),
    conflicts,
  });
}
