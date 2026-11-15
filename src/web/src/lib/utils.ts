import { env } from "cloudflare:workers";
import { Effect, Exit, Schedule } from "effect";
import type { User } from "./auth";
import { AuthService, AuthServiceLive, ensureUserExists } from "./auth";
import { type DbClient, getDbClient } from "./db";
import {
  DatabaseError,
  type UnauthorizedError,
  type UserNotFoundError,
} from "./errors";
import { causeToClientError } from "./server-errors";

/**
 * The layer server functions run with: it provides AuthService
 */
export const AppLayer = AuthServiceLive;

/**
 * Tries `ensureUserExists` gets before a request fails. It's the first query
 * of every server function and a write, so it goes to the D1 primary, and a
 * transient "Network connection lost" there would otherwise fail a request
 * that would have worked: the row almost always exists already, and the
 * inserts are idempotent. One thing a retry can't redo: demo seeding is gated
 * on the user insert having created the row, so if that attempt drops after
 * the insert, a non-production demo account comes up without its demo todos.
 */
export const ENSURE_USER_ATTEMPTS = 3;

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
  callback: (user: User, db: DbClient) => Effect.Effect<A, E>,
): Effect.Effect<
  A,
  E | DatabaseError | UnauthorizedError | UserNotFoundError,
  AuthService
> =>
  Effect.gen(function* () {
    // Get authenticated user from AuthService
    const authService = yield* AuthService;
    const user = yield* authService.getUser;

    // Get database client for this request
    const db = yield* Effect.try({
      try: () => getDbClient(env.DB),
      catch: (error) =>
        new DatabaseError({
          operation: "getClient",
          cause: error,
        }),
    });

    // Ensure user exists in database, retrying transient D1 errors. Only the
    // final failure reaches Sentry, so warn about the ones a later attempt
    // may recover from, or a blip on every request would look healthy.
    let attempt = 0;
    yield* Effect.tryPromise({
      try: () => ensureUserExists(db, user.id, user.email),
      catch: (error) =>
        new DatabaseError({
          operation: "ensureUserExists",
          cause: error,
        }),
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          attempt++;
          if (attempt < ENSURE_USER_ATTEMPTS) {
            console.warn(
              `ensureUserExists attempt ${attempt} of ${ENSURE_USER_ATTEMPTS} failed, retrying`,
              error.cause,
            );
          }
        }),
      ),
      Effect.retry({
        times: ENSURE_USER_ATTEMPTS - 1,
        schedule: Schedule.exponential("50 millis"),
      }),
    );

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
  effect: Effect.Effect<A, E, AuthService>,
): Promise<A> => {
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provide(AppLayer)),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw causeToClientError(exit.cause);
};
