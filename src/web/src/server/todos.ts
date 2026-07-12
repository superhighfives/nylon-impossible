/**
 * Server functions for todos using Effect for type-safe error handling
 */

import { nextDueDate } from "@nylon-impossible/shared/recurrence";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import {
  DatabaseError,
  TodoNotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Todo, TodoMessage, TodoResearch, TodoUrl } from "@/lib/schema";
import { todoMessages, todoResearch, todos, todoUrls } from "@/lib/schema";
import { runEffect, withAuthenticatedUser } from "@/lib/utils";
import {
  createTodoSchema,
  updateTodoSchema,
  updateTodoUrlSchema,
} from "@/lib/validation";
import type {
  CreateTodoInput,
  SerializedResearch,
  SerializedTodoMessage,
  SerializedTodoUrl,
  TodoWithUrls,
  UpdateTodoInput,
} from "@/types/database";

/** Serialize a todo URL for JSON response */
function serializeUrl(url: TodoUrl): SerializedTodoUrl {
  return {
    id: url.id,
    todoId: url.todoId,
    researchId: url.researchId,
    url: url.url,
    title: url.title,
    description: url.description,
    siteName: url.siteName,
    favicon: url.favicon,
    image: url.image,
    showPreview: url.showPreview,
    position: url.position,
    fetchStatus: url.fetchStatus,
    fetchedAt: url.fetchedAt?.toISOString() ?? null,
    createdAt: url.createdAt.toISOString(),
    updatedAt: url.updatedAt.toISOString(),
  };
}

/** Serialize research data for JSON response */
function serializeResearch(research: TodoResearch): SerializedResearch {
  return {
    id: research.id,
    status: research.status,
    researchType: research.researchType,
    summary: research.summary,
    researchedAt: research.researchedAt?.toISOString() ?? null,
    createdAt: research.createdAt.toISOString(),
  };
}

/** Serialize a conversation message for JSON response */
function serializeMessage(message: TodoMessage): SerializedTodoMessage {
  return {
    id: message.id,
    todoId: message.todoId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    awaitingReply: message.awaitingReply,
  };
}

/** Serialize a todo with URLs, research and messages for JSON response */
function serializeTodoWithUrls(
  todo: Todo,
  urls: TodoUrl[],
  research: TodoResearch | null,
  messages: TodoMessage[] = [],
): TodoWithUrls {
  return {
    id: todo.id,
    userId: todo.userId,
    parentId: todo.parentId ?? null,
    title: todo.title,
    notes: todo.notes,
    completed: todo.completed,
    completedAt: todo.completedAt?.toISOString() ?? null,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    priority: todo.priority,
    recurrence: todo.recurrence,
    aiStatus: todo.aiStatus ?? null,
    needsInput: todo.needsInput,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    research: research ? serializeResearch(research) : null,
    messages: messages.map(serializeMessage),
    urls: urls.map(serializeUrl),
  };
}

/**
 * Get all todos for the authenticated user, including their URLs
 */
export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
  const program = withAuthenticatedUser((user, db) =>
    Effect.gen(function* () {
      // Fetch all todos for the user
      const userTodos = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(todos)
            .where(eq(todos.userId, user.id))
            .orderBy(asc(todos.position), desc(todos.createdAt)),
        catch: (error) =>
          new DatabaseError({
            operation: "getTodos",
            cause: error,
          }),
      });

      // Fetch all URLs and research for the user's todos
      const todoIds = userTodos.map((t) => t.id);
      let allUrls: TodoUrl[] = [];
      let allResearch: TodoResearch[] = [];
      let allMessages: TodoMessage[] = [];
      if (todoIds.length > 0) {
        const [urls, research, messages] = yield* Effect.tryPromise({
          try: () =>
            Promise.all([
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
            ]),
          catch: (error) =>
            new DatabaseError({
              operation: "getTodoUrlsAndResearch",
              cause: error,
            }),
        });
        allUrls = urls;
        allResearch = research;
        allMessages = messages;
      }

      // Group URLs by todoId
      const urlsByTodoId = new Map<string, TodoUrl[]>();
      for (const url of allUrls) {
        const existing = urlsByTodoId.get(url.todoId) ?? [];
        existing.push(url);
        urlsByTodoId.set(url.todoId, existing);
      }

      // Index research by todoId
      const researchByTodoId = new Map<string, TodoResearch>();
      for (const research of allResearch) {
        researchByTodoId.set(research.todoId, research);
      }

      // Group messages by todoId (already ordered by createdAt asc)
      const messagesByTodoId = new Map<string, TodoMessage[]>();
      for (const message of allMessages) {
        const existing = messagesByTodoId.get(message.todoId) ?? [];
        existing.push(message);
        messagesByTodoId.set(message.todoId, existing);
      }

      yield* Effect.log(
        `Fetched ${userTodos.length} todos for user ${user.id}`,
      );

      // Return todos with their URLs, research and messages
      return userTodos.map((todo) =>
        serializeTodoWithUrls(
          todo,
          urlsByTodoId.get(todo.id) ?? [],
          researchByTodoId.get(todo.id) ?? null,
          messagesByTodoId.get(todo.id) ?? [],
        ),
      );
    }),
  );

  return runEffect(program);
});

/**
 * Create a new todo
 */
export const createTodo = createServerFn({ method: "POST" })
  .validator((input: CreateTodoInput) => {
    const result = createTodoSchema.safeParse(input);

    if (!result.success) {
      throw new ValidationError({
        errors: result.error.issues.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
    }

    return result.data;
  })
  .handler(async (ctx) => {
    const validated = ctx.data;

    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        const parentId = validated.parentId ?? null;
        if (parentId) {
          const parentTodo = yield* Effect.tryPromise({
            try: () =>
              db
                .select({ id: todos.id, parentId: todos.parentId })
                .from(todos)
                .where(and(eq(todos.id, parentId), eq(todos.userId, user.id)))
                .limit(1)
                .get(),
            catch: (error) =>
              new DatabaseError({
                operation: "getParentTodo",
                cause: error,
              }),
          });
          if (!parentTodo || parentTodo.parentId !== null) {
            return yield* new ValidationError({
              errors: [
                {
                  path: "parentId",
                  message:
                    "parentId must reference one of the user's top-level todos",
                },
              ],
            });
          }
        }

        // Get the last position for fractional indexing, scoped to the sibling
        // group: top-level todos order among themselves (parent_id IS NULL),
        // subtasks among their siblings (parent_id = parentId).
        const lastTodo = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ position: todos.position })
              .from(todos)
              .where(
                and(
                  eq(todos.userId, user.id),
                  parentId
                    ? eq(todos.parentId, parentId)
                    : isNull(todos.parentId),
                ),
              )
              .orderBy(desc(todos.position))
              .limit(1)
              .get(),
          catch: (error) =>
            new DatabaseError({
              operation: "getLastTodo",
              cause: error,
            }),
        });

        const position = generateKeyBetween(lastTodo?.position ?? null, null);

        // Create todo
        const [newTodo] = yield* Effect.tryPromise({
          try: () =>
            db
              .insert(todos)
              .values({
                userId: user.id,
                parentId,
                title: validated.title,
                notes: validated.notes ?? null,
                position,
                completed: false,
                dueDate: validated.dueDate ?? null,
                priority: validated.priority ?? null,
                // A subtask never recurs (recurrence is top-level only).
                recurrence: parentId ? null : (validated.recurrence ?? null),
              })
              .returning(),
          catch: (error) =>
            new DatabaseError({
              operation: "createTodo",
              cause: error,
            }),
        });

        // Adding a subtask to a recurring parent clears the parent's recurrence
        // (mutually exclusive; the explicit subtask wins). isNotNull means we
        // only write when there's a recurrence to clear.
        if (parentId) {
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(todos)
                .set({ recurrence: null })
                .where(
                  and(
                    eq(todos.id, parentId),
                    eq(todos.userId, user.id),
                    isNotNull(todos.recurrence),
                  ),
                ),
            catch: (error) =>
              new DatabaseError({
                operation: "clearParentRecurrence",
                cause: error,
              }),
          });
        }

        yield* Effect.log(`Created todo ${newTodo.id} for user ${user.id}`);

        return newTodo;
      }),
    );

    return runEffect(program);
  });

interface UpdateTodoParams {
  id: string;
  input: UpdateTodoInput;
}

/**
 * Update an existing todo
 */
export const updateTodo = createServerFn({ method: "POST" })
  .validator((data: UpdateTodoParams) => {
    return {
      id: data.id,
      input: updateTodoSchema.parse(data.input),
    };
  })
  .handler(async (ctx) => {
    const { id, input: validated } = ctx.data;

    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        // Fetch existing row so we can server-canonically advance a recurring
        // todo when completion flips false → true. (Mirrors the api worker's
        // update handler.)
        const existing = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(todos)
              .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
              .get(),
          catch: (error) =>
            new DatabaseError({
              operation: "getTodo",
              cause: error,
            }),
        });
        if (!existing) {
          return yield* new TodoNotFoundError({ id });
        }

        // Build update object dynamically
        const updates: Record<string, unknown> = {};
        if (validated.title !== undefined) updates.title = validated.title;
        if (validated.notes !== undefined) updates.notes = validated.notes;
        if (validated.completed !== undefined)
          updates.completed = validated.completed;
        if (validated.position !== undefined)
          updates.position = validated.position;
        if (validated.dueDate !== undefined)
          updates.dueDate = validated.dueDate;
        if (validated.priority !== undefined)
          updates.priority = validated.priority;
        // completedAt is client-set only to undo a completed repeat (null); a
        // normal completion stamps it server-side just below.
        if (validated.completedAt !== undefined)
          updates.completedAt = validated.completedAt;

        // Recurrence and subtasks are mutually exclusive (server-side source of
        // truth). A subtask never recurs, and a todo with children can't recur.
        let recurrence =
          validated.recurrence !== undefined
            ? validated.recurrence
            : existing.recurrence;
        if (recurrence) {
          const isSubtask = existing.parentId != null;
          const hasChildren = isSubtask
            ? false
            : !!(yield* Effect.tryPromise({
                try: () =>
                  db
                    .select({ id: todos.id })
                    .from(todos)
                    .where(
                      and(eq(todos.parentId, id), eq(todos.userId, user.id)),
                    )
                    .limit(1)
                    .get(),
                catch: (error) =>
                  new DatabaseError({
                    operation: "checkSubtasks",
                    cause: error,
                  }),
              }));
          if (isSubtask || hasChildren) recurrence = null;
        }
        if (validated.recurrence !== undefined) updates.recurrence = recurrence;

        const becameComplete =
          validated.completed === true && existing.completed === false;
        const anchor =
          validated.dueDate !== undefined
            ? validated.dueDate
            : existing.dueDate;
        // Completing a repeat doesn't persist as done: roll dueDate forward and
        // stamp completedAt so the UI keeps it in Completed until local midnight.
        if (becameComplete && recurrence && anchor) {
          updates.completed = false;
          updates.completedAt = new Date();
          updates.dueDate = nextDueDate(recurrence, anchor, new Date());
        }

        // Update todo with compound where clause for authorization
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .update(todos)
              .set(updates)
              .where(and(eq(todos.id, id), eq(todos.userId, user.id)))
              .returning(),
          catch: (error) =>
            new DatabaseError({
              operation: "updateTodo",
              cause: error,
            }),
        });

        if (!result) {
          return yield* new TodoNotFoundError({ id });
        }

        // Completion cascade: toggling a top-level todo's completed flag cascades
        // to its subtasks (checking completes them; unchecking reopens them).
        // Subtasks never recur, so completedAt stays null like ordinary
        // completions ($onUpdate bumps updatedAt so they re-sync).
        if (
          existing.parentId == null &&
          validated.completed !== undefined &&
          validated.completed !== existing.completed
        ) {
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(todos)
                .set({ completed: validated.completed })
                .where(and(eq(todos.parentId, id), eq(todos.userId, user.id))),
            catch: (error) =>
              new DatabaseError({
                operation: "cascadeSubtaskCompletion",
                cause: error,
              }),
          });
        }

        yield* Effect.log(`Updated todo ${id} for user ${user.id}`);

        return result;
      }),
    );

    return runEffect(program);
  });

/**
 * Delete a todo
 */
export const deleteTodo = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async (ctx) => {
    const id = ctx.data;

    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        // Verify ownership first
        const existing = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ userId: todos.userId })
              .from(todos)
              .where(eq(todos.id, id))
              .get(),
          catch: (error) =>
            new DatabaseError({
              operation: "getTodo",
              cause: error,
            }),
        });

        if (!existing || existing.userId !== user.id) {
          return yield* new TodoNotFoundError({ id });
        }

        // Delete the todo
        yield* Effect.tryPromise({
          try: () => db.delete(todos).where(eq(todos.id, id)),
          catch: (error) =>
            new DatabaseError({
              operation: "deleteTodo",
              cause: error,
            }),
        });

        yield* Effect.log(`Deleted todo ${id} for user ${user.id}`);

        return { success: true };
      }),
    );

    return runEffect(program);
  });

/**
 * Toggle whether a URL's fetched preview (page title/description) is shown.
 * When showPreview is false, clients render just the raw URL.
 */
export const updateTodoUrlPreview = createServerFn({ method: "POST" })
  .validator((input: { id: string; showPreview: boolean }) =>
    updateTodoUrlSchema.parse(input),
  )
  .handler(async (ctx) => {
    const { id, showPreview } = ctx.data;

    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        // Verify the URL exists and its parent todo belongs to the user.
        const existing = yield* Effect.tryPromise({
          try: () =>
            db
              .select({
                urlId: todoUrls.id,
                todoId: todoUrls.todoId,
                userId: todos.userId,
              })
              .from(todoUrls)
              .innerJoin(todos, eq(todoUrls.todoId, todos.id))
              .where(eq(todoUrls.id, id))
              .get(),
          catch: (error) =>
            new DatabaseError({ operation: "getTodoUrl", cause: error }),
        });

        if (!existing || existing.userId !== user.id) {
          return yield* new TodoNotFoundError({ id });
        }

        yield* Effect.tryPromise({
          try: () =>
            db.update(todoUrls).set({ showPreview }).where(eq(todoUrls.id, id)),
          catch: (error) =>
            new DatabaseError({
              operation: "updateTodoUrlPreview",
              cause: error,
            }),
        });

        // Bump the parent todo so other clients pull the change on next sync.
        yield* Effect.tryPromise({
          try: () =>
            db
              .update(todos)
              .set({ updatedAt: new Date() })
              .where(eq(todos.id, existing.todoId)),
          catch: (error) =>
            new DatabaseError({ operation: "touchTodoForUrl", cause: error }),
        });

        yield* Effect.log(
          `Updated URL ${id} showPreview=${showPreview} for user ${user.id}`,
        );

        return { success: true };
      }),
    );

    return runEffect(program);
  });
