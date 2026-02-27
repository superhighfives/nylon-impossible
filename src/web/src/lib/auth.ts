import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { Context, Effect, Layer } from "effect";
import type { DbClient } from "./db";
import { UnauthorizedError, UserNotFoundError } from "./errors";
import { users } from "./schema";

/**
 * User type returned by auth service
 */
export interface User {
  readonly id: string;
  readonly email: string;
}

/**
 * Ensure user exists in database
 * Uses INSERT ... ON CONFLICT DO NOTHING for atomic operation
 */
export async function ensureUserExists(
  db: DbClient,
  userId: string,
  email: string,
): Promise<void> {
  await db
    .insert(users)
    .values({ id: userId, email: email || "" })
    .onConflictDoNothing();
}

/**
 * Auth service definition
 *
 * This service provides type-safe authentication with Effect.
 * All errors are tracked in the type signature.
 */
export class AuthService extends Context.Tag("AuthService")<
  AuthService,
  {
    /**
     * Get the currently authenticated user
     * @returns Effect that succeeds with User or fails with UnauthorizedError | UserNotFoundError
     */
    readonly getUser: Effect.Effect<
      User,
      UnauthorizedError | UserNotFoundError
    >;
  }
>() {}

/**
 * Live implementation of AuthService using Clerk
 *
 * Usage in server functions:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const authService = yield* AuthService;
 *   const user = yield* authService.getUser;
 *   // ... use user
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(AuthServiceLive)))
 * ```
 */
export const AuthServiceLive = Layer.succeed(
  AuthService,
  AuthService.of({
    getUser: Effect.gen(function* () {
      // Get userId from Clerk auth
      const authResult = yield* Effect.tryPromise({
        try: () => auth(),
        catch: () =>
          new UnauthorizedError({ message: "Failed to get auth context" }),
      });

      const { userId } = authResult;

      // Check if user is authenticated
      if (!userId) {
        return yield* Effect.fail(
          new UnauthorizedError({ message: "User not authenticated" }),
        );
      }

      // Get full user details from Clerk
      const clerkUser = yield* Effect.tryPromise({
        try: () => clerkClient().users.getUser(userId),
        catch: () => new UserNotFoundError({ userId }),
      });

      // Return user with email
      return {
        id: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
      };
    }),
  }),
);
