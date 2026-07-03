import { Effect, Layer } from "effect";
import type { User } from "./auth";
import { AuthService, AuthServiceLive, ensureUserExists } from "./auth";
import { DatabaseService, DatabaseServiceLive } from "./db";
import {
  DatabaseError,
  type UnauthorizedError,
  type UserNotFoundError,
} from "./errors";

/**
 * Combined layer that provides both Auth and Database services
 *
 * This is the main layer you'll use in server functions
 */
export const AppLayer = Layer.mergeAll(AuthServiceLive, DatabaseServiceLive);

/**
 * Wrapper that combines authentication + database + user creation
 *
 * This is the Effect equivalent of the original `withAuthenticatedUser`.
 * Use this in all server functions to ensure consistent auth pattern.
 *
 * @example
 * ```ts
 * const program = withAuthenticatedUser((user, db) =>
 *   Effect.tryPromise({
 *     try: () => db.select().from(todos).where(eq(todos.userId, user.id)),
 *     catch: (error) => new DatabaseError({ operation: "getTodos", cause: error })
 *   })
 * );
 *
 * // Run with error handling
 * const result = await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(AppLayer),
 *     Effect.catchAll(handleError)
 *   )
 * );
 * ```
 */
export const withAuthenticatedUser = <A, E>(
  callback: (user: User, db: import("./db").DbClient) => Effect.Effect<A, E>,
): Effect.Effect<
  A,
  E | DatabaseError | UnauthorizedError | UserNotFoundError,
  AuthService | DatabaseService
> =>
  Effect.gen(function* () {
    // Get authenticated user from AuthService
    const authService = yield* AuthService;
    const user = yield* authService.getUser;

    // Get database client from DatabaseService
    const dbService = yield* DatabaseService;
    const db = yield* dbService.getClient;

    // Ensure user exists in database (same as original implementation)
    yield* Effect.tryPromise({
      try: () => ensureUserExists(db, user.id, user.email),
      catch: (error) =>
        new DatabaseError({
          operation: "ensureUserExists",
          cause: error,
        }),
    });

    // Execute callback with user and db
    return yield* callback(user, db);
  });

/**
 * Convert an Effect program to a Promise for use in server functions
 *
 * This handles the common pattern of running an Effect with AppLayer
 * and converting it to a Promise that TanStack Start expects.
 *
 * Errors are converted to Response objects that TanStack Start can handle.
 *
 * @example
 * ```ts
 * export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
 *   return runEffect(
 *     withAuthenticatedUser((user, db) => ...)
 *   );
 * });
 * ```
 */
export const runEffect = <A, E>(
  effect: Effect.Effect<A, E, AuthService | DatabaseService>,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.catchAll(errorToResponse), Effect.provide(AppLayer)),
  );

/**
 * Convert Effect errors to HTTP responses
 *
 * This provides a standard way to handle errors in server functions.
 * All tagged errors are mapped to appropriate HTTP status codes.
 *
 * @example
 * ```ts
 * return runEffect(
 *   program.pipe(Effect.catchAll(errorToResponse))
 * );
 * ```
 */
export const errorToResponse = (
  error: unknown,
): Effect.Effect<never, Response> => {
  // Handle tagged errors
  if (typeof error === "object" && error !== null && "_tag" in error) {
    switch (error._tag) {
      case "UnauthorizedError":
      case "UserNotFoundError":
        return Effect.fail(
          new Response("Unauthorized", {
            status: 401,
            statusText: "Unauthorized",
          }),
        );

      case "ForbiddenError":
        return Effect.fail(
          new Response("Forbidden", {
            status: 403,
            statusText: "Forbidden",
          }),
        );

      case "TodoNotFoundError":
        return Effect.fail(
          new Response("Not Found", {
            status: 404,
            statusText: "Not Found",
          }),
        );

      case "ValidationError":
        return Effect.fail(
          new Response(
            JSON.stringify({
              errors:
                "errors" in error
                  ? error.errors
                  : [{ message: "Validation failed" }],
            }),
            {
              status: 400,
              statusText: "Bad Request",
              headers: { "Content-Type": "application/json" },
            },
          ),
        );

      case "DatabaseError":
        console.error("Database error:", error);
        return Effect.fail(
          new Response("Internal Server Error", {
            status: 500,
            statusText: "Internal Server Error",
          }),
        );
    }
  }

  // Handle unknown errors
  console.error("Unknown error:", error);
  return Effect.fail(
    new Response("Internal Server Error", {
      status: 500,
      statusText: "Internal Server Error",
    }),
  );
};
