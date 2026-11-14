import { asc, inArray } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { chunkForD1 } from "./d1";
import { type List, type Todo, type TodoUrl, todoUrls } from "./schema";

// The one wire shape for a todo and its links. The API's routes and the web's
// getTodos all serialize through here, so a field added to one reaches every
// client. IDs go out lowercased: iOS sends `uuidString` (uppercase), and
// everything else generates and compares lowercase.

/**
 * Both spellings of the pin for a response body. Pin used to be called
 * Sticky, and the API is mid expand/contract on the rename; see
 * `src/api/src/lib/pinned.ts` for the request side and the contract TODO.
 */
export function pinnedResponseFields(pinned: boolean) {
  return { pinned, sticky: pinned };
}

/**
 * A todo with ISO dates and lowercased IDs. It carries no `urls`: routes that
 * load a todo's links add them (`{ ...serializeTodo(todo), urls }`), so a
 * route that didn't load them can't answer `urls: []` for a todo that has some.
 */
export function serializeTodo(todo: Todo) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    parentId: todo.parentId?.toLowerCase() ?? null,
    listId: todo.listId,
    title: todo.title,
    notes: todo.notes,
    completed: todo.completed,
    completedAt: todo.completedAt?.toISOString() ?? null,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    recurrence: todo.recurrence,
    ...pinnedResponseFields(todo.pinned),
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

/** A todo's link with ISO dates and lowercased IDs. */
export function serializeUrl(url: TodoUrl) {
  return {
    id: url.id.toLowerCase(),
    todoId: url.todoId.toLowerCase(),
    url: url.url,
    title: url.title,
    description: url.description,
    siteName: url.siteName,
    favicon: url.favicon,
    image: url.image ?? null,
    /** When false, clients render just the raw URL instead of the fetched preview. */
    showPreview: url.showPreview,
    position: url.position,
    fetchStatus: url.fetchStatus,
    fetchedAt: url.fetchedAt?.toISOString() ?? null,
    createdAt: url.createdAt.toISOString(),
    updatedAt: url.updatedAt.toISOString(),
  };
}

/**
 * A list with ISO dates, for the API's routes and the web's getLists alike.
 * A null `columnHidden` (never hidden) goes out as shown. The ID keeps its
 * stored case: the API lowercases it, the web compares it as stored.
 */
export function serializeList(list: List) {
  return {
    id: list.id,
    userId: list.userId,
    name: list.name,
    kind: list.kind,
    systemKind: list.systemKind,
    position: list.position,
    columnHidden: list.columnHidden ?? false,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

export type SerializedTodo = ReturnType<typeof serializeTodo>;
export type SerializedTodoUrl = ReturnType<typeof serializeUrl>;

/**
 * Every link of the given todos, keyed by lowercased todo ID (look up with
 * `todo.id.toLowerCase()`), each todo's links in position order. The IDs are
 * batched to D1's bound-parameter cap; a todo lands in exactly one batch, so
 * its links keep their order. Takes the API's and the web's drizzle client
 * alike.
 */
export async function loadUrlsByTodoId<
  TRunResult,
  TSchema extends Record<string, unknown>,
>(
  db: BaseSQLiteDatabase<"async", TRunResult, TSchema>,
  todoIds: readonly string[],
): Promise<Map<string, TodoUrl[]>> {
  const urlsByTodoId = new Map<string, TodoUrl[]>();
  for (const ids of chunkForD1(todoIds)) {
    const rows = await db
      .select()
      .from(todoUrls)
      .where(inArray(todoUrls.todoId, ids))
      .orderBy(asc(todoUrls.position));
    for (const row of rows) {
      const key = row.todoId.toLowerCase();
      const existing = urlsByTodoId.get(key);
      if (existing) existing.push(row);
      else urlsByTodoId.set(key, [row]);
    }
  }
  return urlsByTodoId;
}
