/**
 * Server functions for todos using Effect for type-safe error handling
 */

import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import {
  DatabaseError,
  TodoNotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Todo, TodoResearch, TodoUrl } from "@/lib/schema";
import { todoResearch, todos, todoUrls } from "@/lib/schema";
import { runEffect, withAuthenticatedUser } from "@/lib/utils";
import { createTodoSchema, updateTodoSchema } from "@/lib/validation";
import type {
  CreateTodoInput,
  SerializedResearch,
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

/** Serialize a todo with URLs and research for JSON response */
function serializeTodoWithUrls(
  todo: Todo,
  urls: TodoUrl[],
  research: TodoResearch | null,
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
    aiStatus: todo.aiStatus ?? null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    research: research ? serializeResearch(research) : null,
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
      if (todoIds.length > 0) {
        const [urls, research] = yield* Effect.tryPromise({
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
            ]),
          catch: (error) =>
            new DatabaseError({
              operation: "getTodoUrlsAndResearch",
              cause: error,
            }),
        });
        allUrls = urls;
        allResearch = research;
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

      yield* Effect.log(
        `Fetched ${userTodos.length} todos for user ${user.id}`,
      );

      // Return todos with their URLs and research
      return userTodos.map((todo) =>
        serializeTodoWithUrls(
          todo,
          urlsByTodoId.get(todo.id) ?? [],
          researchByTodoId.get(todo.id) ?? null,
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
        // Build update object dynamically
        const updates: Record<string, unknown> = {};
        if (validated.title !== undefined) updates.title = validated.title;
        if (validated.notes !== undefined)
          updates.notes = validated.notes;
        if (validated.completed !== undefined)
          updates.completed = validated.completed;
        if (validated.position !== undefined)
          updates.position = validated.position;
        if (validated.dueDate !== undefined)
          updates.dueDate = validated.dueDate;
        if (validated.priority !== undefined)
          updates.priority = validated.priority;

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
