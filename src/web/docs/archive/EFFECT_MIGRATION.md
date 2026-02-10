# Effect Migration Guide

This document explains the Effect integration in too-doo and how to use it.

## What Was Changed

### New Files

1. **`src/lib/errors.effect.ts`** - Tagged error types for type-safe error handling
2. **`src/lib/auth.effect.ts`** - Auth service layer with Effect
3. **`src/lib/db.effect.ts`** - Database service layer with Effect
4. **`src/lib/effect-utils.ts`** - Utility functions for Effect integration
5. **`src/server/todos.effect.ts`** - Example server functions migrated to Effect

### Original vs Effect Comparison

#### Original Implementation (`src/server/todos.ts`)

```typescript
export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
  return withAuthenticatedUser(async (user, db) => {
    return await db
      .select()
      .from(todos)
      .where(eq(todos.userId, user.id))
      .orderBy(asc(todos.position), desc(todos.createdAt));
  });
});
```

**Problems:**
- ❌ Errors are invisible in types
- ❌ No structured error handling
- ❌ Hard to add retry/timeout logic
- ❌ No built-in logging/tracing

#### Effect Implementation (`src/server/todos.effect.ts`)

```typescript
export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
  const program = withAuthenticatedUser((user, db) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
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

      yield* Effect.log(`Fetched ${result.length} todos for user ${user.id}`);

      return result;
    }),
  );

  return runEffect(program.pipe(Effect.catchAll(errorToResponse)));
});
```

**Benefits:**
- ✅ All errors tracked in type: `Effect<Todo[], UnauthorizedError | DatabaseError, ...>`
- ✅ Structured error handling with `catchTag`, `catchAll`
- ✅ Built-in logging with `Effect.log`
- ✅ Easy to add retry/timeout: `.pipe(Effect.retry(...), Effect.timeout(...))`

## Key Concepts

### 1. Tagged Errors

All errors extend `Data.TaggedError` which adds a `_tag` field for discrimination:

```typescript
class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

// Usage
const error = new DatabaseError({ operation: "getTodos", cause: err });
error._tag // "DatabaseError"
```

### 2. Service Pattern

Services are defined with `Context.Tag` and provide dependencies:

```typescript
// Definition
class AuthService extends Context.Tag("AuthService")<
  AuthService,
  { readonly getUser: Effect.Effect<User, UnauthorizedError | UserNotFoundError> }
>() {}

// Usage in program
const program = Effect.gen(function* () {
  const authService = yield* AuthService;
  const user = yield* authService.getUser; // Type-safe!
});
```

### 3. Effect Type Signature

```typescript
Effect<Success, Error, Requirements>
//     ↓        ↓      ↓
//     string   never  AuthService
```

- **Success**: What the effect returns on success
- **Error**: Union of all possible errors
- **Requirements**: Services needed to run (provided by Layers)

### 4. Generator Syntax

Effect uses generators for sequential composition:

```typescript
const program = Effect.gen(function* () {
  const user = yield* getUser();        // Unwrap Effect
  const todos = yield* getTodos(user);  // Unwrap Effect
  return todos;                         // Return value
});
```

## Usage Patterns

### Running Effects in Server Functions

```typescript
export const myServerFn = createServerFn({ method: "GET" }).handler(async () => {
  const program = withAuthenticatedUser((user, db) =>
    Effect.gen(function* () {
      // Your logic here
    })
  );

  return runEffect(program.pipe(Effect.catchAll(errorToResponse)));
});
```

### Error Handling

#### Catch All Errors

```typescript
program.pipe(
  Effect.catchAll((error) => {
    // Handle any error
    return Effect.succeed(defaultValue);
  })
);
```

#### Catch Specific Error by Tag

```typescript
program.pipe(
  Effect.catchTag("DatabaseError", (error) => {
    console.error("DB error:", error.operation);
    return Effect.succeed(fallbackValue);
  })
);
```

#### Catch Multiple Specific Errors

```typescript
program.pipe(
  Effect.catchTags({
    DatabaseError: (error) => Effect.succeed(dbFallback),
    UnauthorizedError: (error) => Effect.fail(new Response("Unauthorized", { status: 401 })),
  })
);
```

### Adding Retry Logic

```typescript
program.pipe(
  Effect.retry({
    while: (error) => error._tag === "DatabaseError",
    times: 3,
  })
);
```

### Adding Timeout

```typescript
program.pipe(
  Effect.timeout("5 seconds"),
  Effect.timeoutFailCause({
    duration: "5 seconds",
    onTimeout: () => new DatabaseError({ operation: "...", cause: "timeout" }),
  })
);
```

### Adding Logging

```typescript
Effect.gen(function* () {
  yield* Effect.log("Starting operation");
  const result = yield* doSomething();
  yield* Effect.log(`Completed with ${result.length} items`);
  return result;
});
```

## Migration Checklist

To migrate a server function to Effect:

- [ ] Identify all possible errors
- [ ] Create tagged error classes if needed
- [ ] Wrap the handler with `withAuthenticatedUser`
- [ ] Use `Effect.tryPromise` for async operations
- [ ] Add error handling with `catchTag` or `catchAll`
- [ ] Add logging for observability
- [ ] Consider adding retry/timeout logic
- [ ] Run with `runEffect` and error conversion

## Testing Benefits

Effect makes testing much easier:

```typescript
// Create mock services
const MockAuthService = Layer.succeed(
  AuthService,
  AuthService.of({
    getUser: Effect.succeed({ id: "test-user", email: "test@example.com" }),
  })
);

const MockDbService = Layer.succeed(
  DatabaseService,
  DatabaseService.of({
    getClient: Effect.succeed(mockDb),
  })
);

const TestLayer = Layer.mergeAll(MockAuthService, MockDbService);

// Test the program
const result = await Effect.runPromise(
  program.pipe(Effect.provide(TestLayer))
);
```

## Advanced Features

### Combining Effects Concurrently

```typescript
// Run multiple effects in parallel
const [todos, user, settings] = yield* Effect.all(
  [getTodos(), getUser(), getSettings()],
  { concurrency: "unbounded" }
);
```

### Resource Management

```typescript
// Automatically cleanup resources
const program = Effect.acquireUseRelease(
  Effect.sync(() => openConnection()),
  (conn) => useConnection(conn),
  (conn) => Effect.sync(() => conn.close())
);
```

### Tracing

```typescript
// Add spans for distributed tracing
const program = Effect.gen(function* () {
  yield* Effect.annotateCurrentSpan("userId", user.id);
  // ... operations are automatically traced
}).pipe(Effect.withSpan("getTodos"));
```

## Performance Considerations

- **Bundle Size**: Effect adds ~500KB to bundle (minified)
- **Runtime Overhead**: Minimal (comparable to promises)
- **Type Checking**: May increase TypeScript compilation time slightly

## When to Use Effect

✅ **Good for:**
- Server functions with complex error handling
- Operations that need retries/timeouts
- Services that need dependency injection
- Code that benefits from structured logging

❌ **Skip for:**
- Very simple CRUD operations
- Client-side React components (use React Query)
- Pure utility functions with no side effects

## Next Steps

1. **Try the examples**: Import from `src/server/todos.effect.ts` instead of `src/server/todos.ts`
2. **Migrate one function**: Pick a complex server function and migrate it
3. **Add retry logic**: Use `Effect.retry` on flaky network calls
4. **Add logging**: Use `Effect.log` for better observability
5. **Create tests**: Write tests using mock service layers

## Resources

- [Effect Documentation](https://effect.website/docs/quickstart)
- [Effect Discord](https://discord.gg/effect-ts)
- [Effect GitHub](https://github.com/Effect-TS/effect)
