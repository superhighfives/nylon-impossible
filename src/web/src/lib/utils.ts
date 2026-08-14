import { Effect, Exit, Layer } from "effect";
import type { User } from "./auth";
import { AuthService, AuthServiceLive, ensureUserExists } from "./auth";
import { DatabaseService, DatabaseServiceLive } from "./db";
import {
  DatabaseError,
  type UnauthorizedError,
  type UserNotFoundError,
} from "./errors";
import { causeToClientError } from "./server-errors";

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
 * Convert an Effect program to a Promise for use in server functions.
 *
 * Runs the effect with AppLayer and, on failure, throws a `ServerFnError`
 * (see ./server-errors) carrying a real message. Throwing the Error directly
 * (rather than letting
 * `Effect.runPromise` reject with a FiberFailure wrapping a messageless
 * `Response`) is what lets TanStack Start serialize a useful message to the
 * client instead of `Error: No error message`.
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
export const runEffect = async <A, E>(
  effect: Effect.Effect<A, E, AuthService | DatabaseService>,
): Promise<A> => {
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provide(AppLayer)),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw causeToClientError(exit.cause);
};
