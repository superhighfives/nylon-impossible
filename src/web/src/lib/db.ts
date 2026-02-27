import { env } from "cloudflare:workers";
import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import { Context, Effect, Layer } from "effect";
import { DatabaseError } from "./errors";
import * as schema from "./schema";

/**
 * Database client type
 */
export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Creates a new Drizzle Client instance for D1
 * Must be called per-request in Cloudflare Workers
 * @param db - D1 database binding from env.DB
 */
export function getDbClient(db: D1Database): DbClient {
  if (!db) {
    throw new Error("D1 database binding not found");
  }
  return drizzle(db, { schema });
}

/**
 * Database service definition
 *
 * Provides type-safe database access with Effect.
 * Automatically handles connection errors.
 */
export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  {
    /**
     * Get database client
     * @returns Effect that succeeds with DbClient or fails with DatabaseError
     */
    readonly getClient: Effect.Effect<DbClient, DatabaseError>;
  }
>() {}

/**
 * Live implementation of DatabaseService
 *
 * Usage:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const dbService = yield* DatabaseService;
 *   const db = yield* dbService.getClient;
 *   // ... use db
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(DatabaseServiceLive)))
 * ```
 */
export const DatabaseServiceLive = Layer.succeed(
  DatabaseService,
  DatabaseService.of({
    getClient: Effect.try({
      try: () => getDbClient(env.DB),
      catch: (error) =>
        new DatabaseError({
          operation: "getClient",
          cause: error,
        }),
    }),
  }),
);

/**
 * Helper to run database operations with automatic error handling
 *
 * @example
 * ```ts
 * const result = yield* withDb((db) =>
 *   Effect.tryPromise({
 *     try: () => db.select().from(todos).where(eq(todos.userId, userId)),
 *     catch: (error) => new DatabaseError({ operation: "selectTodos", cause: error })
 *   })
 * );
 * ```
 */
export const withDb = <A, E>(
  operation: (db: DbClient) => Effect.Effect<A, E>,
): Effect.Effect<A, E | DatabaseError, DatabaseService> =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;
    const db = yield* dbService.getClient;
    return yield* operation(db);
  });
