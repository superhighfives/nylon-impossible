# Effect vs Original Implementation - Side-by-Side Comparison

This document shows the original code and Effect-based code side by side to highlight the differences.

## Example 1: getTodos

### Original (`src/server/todos.ts`)

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

**Type Signature (inferred):**
```typescript
() => Promise<Todo[]>
```

**Issues:**
1. No error tracking in types
2. `withAuthenticatedUser` can throw but it's invisible
3. Database query can fail but no explicit handling
4. No logging or observability
5. Can't easily add retry or timeout

### With Effect (`src/server/todos.effect.ts`)

```typescript
export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
  const program = withAuthenticatedUser((user, db) =>
    Effect.gen(function* () {
      // Query with explicit error handling
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

      // Built-in logging
      yield* Effect.log(`Fetched ${result.length} todos for user ${user.id}`);

      return result;
    }),
  );

  return runEffect(program.pipe(Effect.catchAll(errorToResponse)));
});
```

**Type Signature (explicit):**
```typescript
Effect<
  Todo[],                                      // Success type
  UnauthorizedError | DatabaseError,          // All possible errors
  AuthService | DatabaseService               // Required services
>
```

**Benefits:**
1. ✅ All errors visible in types
2. ✅ Each error has a specific type and context
3. ✅ Built-in logging for production debugging
4. ✅ Easy to add retry: `.pipe(Effect.retry({ times: 3 }))`
5. ✅ Easy to add timeout: `.pipe(Effect.timeout("5 seconds"))`

---

## Example 2: createTodo with Validation

### Original (`src/server/todos.ts`)

```typescript
export const createTodo = createServerFn({ method: "POST" })
  .inputValidator((input: CreateTodoInput) => createTodoSchema.parse(input))
  .handler(async (ctx) => {
    const validated = ctx.data;

    return withAuthenticatedUser(async (user, db) => {
      // Get last position
      const lastTodo = await db
        .select({ position: todos.position })
        .from(todos)
        .where(eq(todos.userId, user.id))
        .orderBy(desc(todos.position))
        .limit(1)
        .get();

      const position = generateKeyBetween(lastTodo?.position ?? null, null);

      // Create todo
      const [newTodo] = await db
        .insert(todos)
        .values({
          userId: user.id,
          title: validated.title,
          position,
          completed: false,
        })
        .returning();

      return newTodo;
    });
  });
```

**Problems:**
1. Validation error is thrown (no type tracking)
2. Database queries can fail silently
3. No logging of successful operations
4. Can't retry on transient failures
5. No timeout protection

### With Effect (`src/server/todos.effect.ts`)

```typescript
export const createTodo = createServerFn({ method: "POST" })
  .inputValidator((input: CreateTodoInput) => {
    const result = createTodoSchema.safeParse(input);
    if (!result.success) {
      // Structured validation error
      throw new ValidationError({
        errors: result.error.errors.map((e) => ({
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
        // Get last position with error handling
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

        // Create todo with error handling
        const [newTodo] = yield* Effect.tryPromise({
          try: () =>
            db
              .insert(todos)
              .values({
                userId: user.id,
                title: validated.title,
                position,
                completed: false,
              })
              .returning(),
          catch: (error) =>
            new DatabaseError({
              operation: "createTodo",
              cause: error,
            }),
        });

        // Log successful creation
        yield* Effect.log(`Created todo ${newTodo.id} for user ${user.id}`);

        return newTodo;
      }),
    );

    return runEffect(program.pipe(Effect.catchAll(errorToResponse)));
  });
```

**Benefits:**
1. ✅ Validation errors are structured with field paths
2. ✅ Each database operation explicitly handles errors
3. ✅ Logs successful operations automatically
4. ✅ Can add retry with one line: `.pipe(Effect.retry({ times: 3 }))`
5. ✅ Can add timeout with one line: `.pipe(Effect.timeout("5 seconds"))`

---

## Example 3: Error Handling Pattern

### Original Error Handling

```typescript
// src/lib/auth.ts
export async function getAuthenticatedUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");  // ❌ Generic error, no context
  }
  const user = await clerkClient().users.getUser(userId);
  return { id: userId, email: user.emailAddresses[0]?.emailAddress || "" };
}

// src/server/todos.ts
const [result] = await db.update(todos).set(updates).where(...).returning();
if (!result) {
  throw new Error("Todo not found");  // ❌ Generic error
}
```

**Issues:**
- All errors are generic `Error`
- No structured information about what failed
- Can't distinguish between different error types
- Hard to handle errors differently based on type

### Effect Error Handling

```typescript
// src/lib/auth.effect.ts
export const AuthServiceLive = Layer.succeed(
  AuthService,
  AuthService.of({
    getUser: Effect.gen(function* () {
      const authResult = yield* Effect.tryPromise({
        try: () => auth(),
        catch: () => new UnauthorizedError({
          message: "Failed to get auth context"
        }),
      });

      const { userId } = authResult;

      if (!userId) {
        return yield* Effect.fail(
          new UnauthorizedError({ message: "User not authenticated" })
        );
      }

      const clerkUser = yield* Effect.tryPromise({
        try: () => clerkClient().users.getUser(userId),
        catch: () => new UserNotFoundError({ userId }),
      });

      return {
        id: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
      };
    }),
  }),
);

// Can handle specifically:
program.pipe(
  Effect.catchTag("UnauthorizedError", (error) => {
    // Return 401
    return Effect.fail(new Response("Unauthorized", { status: 401 }));
  }),
  Effect.catchTag("UserNotFoundError", (error) => {
    // Log the userId that wasn't found
    console.error(`User ${error.userId} not found`);
    return Effect.fail(new Response("Not Found", { status: 404 }));
  })
);
```

**Benefits:**
- ✅ Each error type carries specific context
- ✅ Can handle errors differently based on `_tag`
- ✅ Type system prevents unhandled errors
- ✅ Better debugging with structured error data

---

## Example 4: Adding Production Features

### Original - Hard to Add Features

To add retry logic to the original code:

```typescript
// Would need to wrap everything in a manual retry loop
export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return await withAuthenticatedUser(async (user, db) => {
        return await db.select()...;
      });
    } catch (error) {
      attempts++;
      if (attempts >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
    }
  }
});
```

**Problems:**
- Manual retry loop is error-prone
- Have to implement exponential backoff manually
- Hard to configure (retry count, delays, etc.)
- Mixes retry logic with business logic

### With Effect - Easy to Add Features

```typescript
export const getTodos = createServerFn({ method: "GET" }).handler(async () => {
  const program = withAuthenticatedUser((user, db) =>
    Effect.gen(function* () {
      // ... business logic
    })
  );

  return runEffect(
    program.pipe(
      // Add retry with exponential backoff (one line!)
      Effect.retry({
        while: (error) => error._tag === "DatabaseError",
        times: 3,
      }),
      
      // Add timeout protection (one line!)
      Effect.timeout("5 seconds"),
      
      // Add logging (one line!)
      Effect.tap(Effect.log("Completed getTodos")),
      
      // Handle errors
      Effect.catchAll(errorToResponse),
    )
  );
});
```

**Benefits:**
- ✅ Each feature is one line
- ✅ Composable and declarative
- ✅ Easy to configure
- ✅ Separated from business logic

---

## Testing Comparison

### Original Testing

```typescript
// Need to mock at the function level
jest.mock("@clerk/tanstack-react-start/server", () => ({
  auth: jest.fn().mockResolvedValue({ userId: "test-user" }),
  clerkClient: jest.fn(),
}));

jest.mock("./db-client", () => ({
  getDbClient: jest.fn().mockResolvedValue(mockDb),
}));

// Hard to test error scenarios
test("handles auth error", async () => {
  // Need to reconfigure mocks
  auth.mockRejectedValueOnce(new Error("Auth failed"));
  // ... rest of test
});
```

### Effect Testing

```typescript
// Create test layers with mock implementations
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

// Test success case
test("returns todos", async () => {
  const result = await Effect.runPromise(
    getTodosProgram.pipe(Effect.provide(TestLayer))
  );
  expect(result).toEqual([...]);
});

// Test error cases - just change the layer!
test("handles auth error", async () => {
  const FailingAuthLayer = Layer.succeed(
    AuthService,
    AuthService.of({
      getUser: Effect.fail(new UnauthorizedError({ message: "Not logged in" })),
    })
  );
  
  const TestLayerWithFailure = Layer.mergeAll(FailingAuthLayer, MockDbService);
  
  await expect(
    Effect.runPromise(
      getTodosProgram.pipe(Effect.provide(TestLayerWithFailure))
    )
  ).rejects.toThrow(UnauthorizedError);
});
```

**Benefits:**
- ✅ No global mocks
- ✅ Easy to test different scenarios
- ✅ Type-safe mocks
- ✅ Composable test setup

---

## Summary

| Feature | Original | With Effect |
|---------|----------|-------------|
| **Error Types** | Generic `Error` | Tagged errors with context |
| **Type Safety** | Errors invisible | All errors in type signature |
| **Retry Logic** | Manual implementation | One line: `Effect.retry()` |
| **Timeout** | Manual implementation | One line: `Effect.timeout()` |
| **Logging** | Manual `console.log` | Built-in `Effect.log()` |
| **Testing** | Global mocks | Service layers |
| **Composability** | Low | High |
| **Error Handling** | try-catch | Structured with `catchTag` |
| **Observability** | Manual | Built-in tracing/metrics |

## When to Use Which?

**Use Original (Promise-based) when:**
- Very simple CRUD operations
- No error handling needed
- Prototyping quickly
- Team unfamiliar with Effect

**Use Effect when:**
- Complex error scenarios
- Need retry/timeout logic
- Production-grade reliability
- Better testability required
- Type-safe error handling important
