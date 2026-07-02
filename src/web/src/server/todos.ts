/**
 * Server functions for todos using Effect for type-safe error handling
 */

import { clerkClient } from "@clerk/tanstack-react-start/server";
import { nextDueDate } from "@nylon-impossible/shared/recurrence";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import {
  DatabaseError,
  ExternalServiceError,
  TodoNotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Todo, TodoMessage, TodoResearch, TodoUrl } from "@/lib/schema";
import { todoMessages, todoResearch, todos, todoUrls } from "@/lib/schema";
import { runEffect, withAuthenticatedUser } from "@/lib/utils";
import { createTodoSchema, updateTodoSchema } from "@/lib/validation";
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
    title: todo.title,
    notes: todo.notes,
    completed: todo.completed,
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
  .inputValidator((input: CreateTodoInput) => {
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
        // Get the last position for fractional indexing
        const lastTodo = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ position: todos.position })
              .from(todos)
              .where(eq(todos.userId, user.id))
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
                title: validated.title,
                notes: validated.notes ?? null,
                position,
                completed: false,
                dueDate: validated.dueDate ?? null,
                priority: validated.priority ?? null,
                recurrence: validated.recurrence ?? null,
              })
              .returning(),
          catch: (error) =>
            new DatabaseError({
              operation: "createTodo",
              cause: error,
            }),
        });

        yield* Effect.log(`Created todo ${newTodo.id} for user ${user.id}`);

        return newTodo;
      }),
    );

    return runEffect(program);
  });

/** A single task as returned by the Google Tasks REST API. */
interface GoogleTask {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
}

/**
 * Fetch all incomplete tasks from the user's default Google Tasks list
 * ("My Tasks"), following pagination. Completed tasks are excluded so an
 * import only brings across open todos.
 */
async function fetchGoogleTasks(accessToken: string): Promise<GoogleTask[]> {
  const tasks: GoogleTask[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
    );
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Tasks API ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      items?: GoogleTask[];
      nextPageToken?: string;
    };
    if (json.items) tasks.push(...json.items);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return tasks;
}

/**
 * Import todos from the authenticated user's Google Tasks account.
 *
 * Requires a Google OAuth connection in Clerk granting the
 * `https://www.googleapis.com/auth/tasks.readonly` scope. Tasks already
 * imported (matched on `googleTaskId`) are skipped, so this is safe to run
 * repeatedly.
 */
export const importGoogleTasks = createServerFn({ method: "POST" }).handler(
  async () => {
    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        // Exchange the Clerk-held Google connection for an access token.
        const tokenResponse = yield* Effect.tryPromise({
          try: () =>
            clerkClient().users.getUserOauthAccessToken(user.id, "google"),
          catch: (cause) =>
            new ExternalServiceError({
              service: "clerk",
              message: "Couldn't reach your Google account. Try again.",
              status: 502,
              cause,
            }),
        });

        const accessToken = tokenResponse.data[0]?.token;
        if (!accessToken) {
          return yield* Effect.fail(
            new ExternalServiceError({
              service: "google",
              message:
                "Connect your Google account (with Tasks access) to import.",
              status: 400,
            }),
          );
        }

        // Pull every open task from the default list.
        const googleTasks = yield* Effect.tryPromise({
          try: () => fetchGoogleTasks(accessToken),
          catch: (cause) =>
            new ExternalServiceError({
              service: "google",
              message: "Couldn't fetch your Google Tasks. Try again.",
              status: 502,
              cause,
            }),
        });

        if (googleTasks.length === 0) {
          return { imported: 0, skipped: 0 };
        }

        // Skip tasks already imported (dedupe on googleTaskId).
        const existing = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ googleTaskId: todos.googleTaskId })
              .from(todos)
              .where(eq(todos.userId, user.id)),
          catch: (error) =>
            new DatabaseError({
              operation: "getImportedTaskIds",
              cause: error,
            }),
        });
        const importedIds = new Set(
          existing.map((row) => row.googleTaskId).filter(Boolean),
        );

        const toImport = googleTasks.filter(
          (task) => !importedIds.has(task.id),
        );
        if (toImport.length === 0) {
          return { imported: 0, skipped: googleTasks.length };
        }

        // Get the last position so imported todos append to the bottom.
        const lastTodo = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ position: todos.position })
              .from(todos)
              .where(eq(todos.userId, user.id))
              .orderBy(desc(todos.position))
              .limit(1)
              .get(),
          catch: (error) =>
            new DatabaseError({ operation: "getLastTodo", cause: error }),
        });

        let prevPosition = lastTodo?.position ?? null;
        const rows = toImport.map((task) => {
          const position = generateKeyBetween(prevPosition, null);
          prevPosition = position;
          const title = (task.title?.trim() || "Untitled").slice(0, 500);
          return {
            userId: user.id,
            googleTaskId: task.id,
            title,
            notes: task.notes ? task.notes.slice(0, 10000) : null,
            completed: false,
            position,
            dueDate: task.due ? new Date(task.due) : null,
          };
        });

        yield* Effect.tryPromise({
          try: () => db.insert(todos).values(rows),
          catch: (error) =>
            new DatabaseError({ operation: "importGoogleTasks", cause: error }),
        });

        yield* Effect.log(
          `Imported ${rows.length} Google Tasks for user ${user.id}`,
        );

        return {
          imported: rows.length,
          skipped: googleTasks.length - rows.length,
        };
      }),
    );

    return runEffect(program);
  },
);

interface UpdateTodoParams {
  id: string;
  input: UpdateTodoInput;
}

/**
 * Update an existing todo
 */
export const updateTodo = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateTodoParams) => {
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
          return yield* Effect.fail(new TodoNotFoundError({ id }));
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
        if (validated.recurrence !== undefined)
          updates.recurrence = validated.recurrence;

        const becameComplete =
          validated.completed === true && existing.completed === false;
        const recurrence =
          validated.recurrence !== undefined
            ? validated.recurrence
            : existing.recurrence;
        const anchor =
          validated.dueDate !== undefined
            ? validated.dueDate
            : existing.dueDate;
        if (becameComplete && recurrence && anchor) {
          updates.completed = false;
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
          return yield* Effect.fail(new TodoNotFoundError({ id }));
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
  .inputValidator((id: string) => id)
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
          return yield* Effect.fail(new TodoNotFoundError({ id }));
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
