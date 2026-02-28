# Effect Integration

**Date**: 2026-02-12
**Status**: Complete

## Overview

Adopted the [Effect](https://effect.website) library for type-safe error handling, dependency injection, and composable server function patterns in the web app.

## Why Effect

The original server functions used plain async/await with thrown errors. This meant:
- Errors were invisible in TypeScript types
- No structured error context (just `new Error("message")`)
- Retry, timeout, and logging required manual boilerplate
- Testing required global mocks (`jest.mock(...)`)

Effect solves all of these with its `Effect<Success, Error, Requirements>` type signature.

## Architecture

### Service pattern

Two core services provide dependencies to all server functions:

```typescript
// src/web/src/lib/auth.ts
class AuthService extends Context.Tag("AuthService")<AuthService, {
  readonly getUser: Effect.Effect<User, UnauthorizedError | UserNotFoundError>
}>() {}

// src/web/src/lib/db.ts
class DatabaseService extends Context.Tag("DatabaseService")<DatabaseService, {
  readonly getClient: Effect.Effect<DbClient, DatabaseError>
}>() {}
```

Live implementations (`AuthServiceLive`, `DatabaseServiceLive`) are combined into `AppLayer`:

```typescript
// src/web/src/lib/utils.ts
export const AppLayer = Layer.mergeAll(AuthServiceLive, DatabaseServiceLive);
```

### Server function pattern

All server functions follow the same pattern via `withAuthenticatedUser` and `runEffect`:

```typescript
export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
  const program = withAuthenticatedUser((user, db) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () => db.select().from(todos).where(eq(todos.userId, user.id)),
        catch: (error) => new DatabaseError({ operation: "getTodos", cause: error }),
      });
      yield* Effect.log(`Fetched ${result.length} todos for user ${user.id}`);
      return result;
    }),
  );
  return runEffect(program);
});
```

`withAuthenticatedUser` handles:
1. Getting the authenticated user from Clerk via `AuthService`
2. Getting the database client via `DatabaseService`
3. Ensuring the user exists in D1 (upsert)
4. Passing `user` and `db` to the callback

`runEffect` handles:
1. Providing `AppLayer` (auth + database services)
2. Converting tagged errors to HTTP `Response` objects via `errorToResponse`
3. Running the Effect as a Promise for TanStack Start

### Error-to-response mapping

```typescript
// src/web/src/lib/utils.ts - errorToResponse
UnauthorizedError | UserNotFoundError → 401
ForbiddenError                        → 403
TodoNotFoundError                     → 404
ValidationError                       → 400 (JSON body with field errors)
DatabaseError                         → 500
```

## Files

### Core

| File | Purpose |
|------|---------|
| `src/web/src/lib/errors.ts` | Tagged error classes (`Data.TaggedError`) |
| `src/web/src/lib/auth.ts` | `AuthService` definition + `AuthServiceLive` (Clerk) |
| `src/web/src/lib/db.ts` | `DatabaseService` definition + `DatabaseServiceLive` (D1/Drizzle) |
| `src/web/src/lib/utils.ts` | `AppLayer`, `withAuthenticatedUser`, `runEffect`, `errorToResponse` |
| `src/web/src/lib/validation.ts` | Zod schemas (validation errors become `ValidationError`) |

### Server functions using Effect

| File | Functions |
|------|-----------|
| `src/web/src/server/todos.ts` | `getTodos`, `createTodo`, `updateTodo`, `deleteTodo` |
| `src/web/src/server/ai.ts` | `extractTodosFromText` |

## Tagged error types

All errors extend `Data.TaggedError` for discriminated union matching:

| Error | Fields | Usage |
|-------|--------|-------|
| `UnauthorizedError` | `message?` | No auth context or session |
| `UserNotFoundError` | `userId` | Clerk user lookup failed |
| `DatabaseError` | `operation`, `cause` | Any D1/Drizzle failure |
| `TodoNotFoundError` | `id` | Todo doesn't exist or wrong owner |
| `ValidationError` | `errors: {path, message}[]` | Zod validation failure |
| `ForbiddenError` | `resource`, `userId` | Authorization failure |
| `AIExtractionError` | `message`, `cause?` | AI model failure |
| `AIRateLimitError` | `message`, `retryAfter?` | 429 from AI Gateway |
| `AITimeoutError` | `message` | Request timeout |

## Key patterns

### Generator syntax

Effect uses generators for sequential async composition:

```typescript
Effect.gen(function* () {
  const user = yield* authService.getUser;       // Unwrap Effect (may fail)
  const result = yield* Effect.tryPromise({...}); // Wrap Promise → Effect
  yield* Effect.log("message");                   // Side effect
  return result;                                  // Success value
});
```

### Wrapping promises

`Effect.tryPromise` converts a Promise to an Effect with explicit error mapping:

```typescript
yield* Effect.tryPromise({
  try: () => db.select().from(todos),
  catch: (error) => new DatabaseError({ operation: "select", cause: error }),
});
```

### Error handling

```typescript
// Catch all errors
program.pipe(Effect.catchAll(errorToResponse))

// Catch specific error by tag
program.pipe(Effect.catchTag("DatabaseError", (e) => ...))

// Catch multiple specific errors
program.pipe(Effect.catchTags({
  DatabaseError: (e) => ...,
  UnauthorizedError: (e) => ...,
}))
```

### Composable features (available but not currently used)

```typescript
// Retry with backoff
program.pipe(Effect.retry({ while: (e) => e._tag === "DatabaseError", times: 3 }))

// Timeout
program.pipe(Effect.timeout("5 seconds"))

// Concurrent execution
yield* Effect.all([op1(), op2(), op3()], { concurrency: "unbounded" })
```

### Testing with mock layers

```typescript
const MockAuthService = Layer.succeed(AuthService, AuthService.of({
  getUser: Effect.succeed({ id: "test-user", email: "test@example.com" }),
}));

const TestLayer = Layer.mergeAll(MockAuthService, MockDbService);

const result = await Effect.runPromise(program.pipe(Effect.provide(TestLayer)));
```

## Dependencies

```json
{ "effect": "^3.19.13" }
```
