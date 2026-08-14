/**
 * Server functions for lists (Today/This Week/Sometime + custom lists) using
 * Effect for type-safe error handling, mirroring src/api/src/handlers/lists.ts
 * for the Worker REST API.
 */

import { createServerFn } from "@tanstack/react-start";
import { and, count, eq } from "drizzle-orm";
import { Effect } from "effect";
import {
  DatabaseError,
  ListNotFoundError,
  SystemListImmutableError,
  ValidationError,
} from "@/lib/errors";
import type { List } from "@/lib/schema";
import { lists, todos } from "@/lib/schema";
import { runEffect, withAuthenticatedUser } from "@/lib/utils";
import { createListSchema, updateListSchema } from "@/lib/validation";
import type {
  CreateListInput,
  SerializedList,
  UpdateListInput,
} from "@/types/database";

function serializeList(list: List): SerializedList {
  return {
    id: list.id,
    userId: list.userId,
    name: list.name,
    kind: list.kind,
    systemKind: list.systemKind,
    position: list.position,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

/** Get all of the user's lists (system + custom), in position order. */
export const getLists = createServerFn({ method: "GET" }).handler(async () => {
  const program = withAuthenticatedUser((user, db) =>
    Effect.gen(function* () {
      const userLists = yield* Effect.tryPromise({
        try: () =>
          db.select().from(lists).where(eq(lists.userId, user.id)).all(),
        catch: (error) =>
          new DatabaseError({ operation: "getLists", cause: error }),
      });
      return userLists
        .sort((a, b) => a.position.localeCompare(b.position))
        .map(serializeList);
    }),
  );
  return runEffect(program);
});

/** Create a new custom list. System lists are only ever provisioned at account creation. */
export const createList = createServerFn({ method: "POST" })
  .validator((input: CreateListInput) => {
    const result = createListSchema.safeParse(input);
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
        const [newList] = yield* Effect.tryPromise({
          try: () =>
            db
              .insert(lists)
              .values({
                userId: user.id,
                name: validated.name,
                kind: "custom",
                position: validated.position ?? "a0",
              })
              .returning(),
          catch: (error) =>
            new DatabaseError({ operation: "createList", cause: error }),
        });
        return serializeList(newList);
      }),
    );
    return runEffect(program);
  });

interface UpdateListParams {
  id: string;
  input: UpdateListInput;
}

/** Rename/reposition a custom list. Rejects system lists. */
export const updateList = createServerFn({ method: "POST" })
  .validator((data: UpdateListParams) => {
    const result = updateListSchema.safeParse(data.input);
    if (!result.success) {
      throw new ValidationError({
        errors: result.error.issues.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
    }
    return { id: data.id, input: result.data };
  })
  .handler(async (ctx) => {
    const { id, input: validated } = ctx.data;
    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        const existing = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(lists)
              .where(and(eq(lists.id, id), eq(lists.userId, user.id)))
              .get(),
          catch: (error) =>
            new DatabaseError({ operation: "getList", cause: error }),
        });
        if (!existing) return yield* new ListNotFoundError({ id });
        if (existing.kind === "system") {
          return yield* new SystemListImmutableError({ id });
        }

        const updates: Record<string, unknown> = {};
        if (validated.name !== undefined) updates.name = validated.name;
        if (validated.position !== undefined)
          updates.position = validated.position;

        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .update(lists)
              .set(updates)
              .where(and(eq(lists.id, id), eq(lists.userId, user.id)))
              .returning(),
          catch: (error) =>
            new DatabaseError({ operation: "updateList", cause: error }),
        });
        return serializeList(result);
      }),
    );
    return runEffect(program);
  });

/**
 * Delete a custom list. Cascade-deletes its todos via the FK. Rejects system
 * lists. Returns the deleted todo count so the caller can show a "this
 * deleted N todos" confirmation after the fact — pair with a client-side
 * confirm (using the count from `getLists`/local state) before calling this.
 */
export const deleteList = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async (ctx) => {
    const id = ctx.data;
    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        const existing = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(lists)
              .where(and(eq(lists.id, id), eq(lists.userId, user.id)))
              .get(),
          catch: (error) =>
            new DatabaseError({ operation: "getList", cause: error }),
        });
        if (!existing) return yield* new ListNotFoundError({ id });
        if (existing.kind === "system") {
          return yield* new SystemListImmutableError({ id });
        }

        const [{ todoCount }] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ todoCount: count() })
              .from(todos)
              .where(eq(todos.listId, id)),
          catch: (error) =>
            new DatabaseError({ operation: "countListTodos", cause: error }),
        });

        yield* Effect.tryPromise({
          try: () => db.delete(lists).where(eq(lists.id, id)),
          catch: (error) =>
            new DatabaseError({ operation: "deleteList", cause: error }),
        });

        return { success: true, deletedTodoCount: todoCount };
      }),
    );
    return runEffect(program);
  });
