# Test Suite Implementation Plan

## Context

The Nylon Impossible monorepo has three projects (API, web, iOS) with zero test coverage across all of them. The goal is to add comprehensive test suites to each project, starting with migrating the API to Hono (from manual routing), then building out tests for all three.

The web project already has Vitest + Testing Library installed but unconfigured. The iOS project has no test target at all.

---

## Phase 1: Migrate API to Hono

The current API (`src/api/src/index.ts`) uses manual `if`/regex routing. Migrate to Hono for cleaner routing, middleware, and testability via `app.request()`.

### Install Hono

Add `hono` to `src/api/package.json` dependencies.

### Rewrite `src/api/src/index.ts`

Convert manual routing to Hono app:
- `app.options("*", ...)` for CORS preflight
- `app.get("/", ...)` and `app.get("/health", ...)` for health check
- `app.get("/ws", ...)` for WebSocket upgrade
- Auth middleware on `/todos/*` routes using `app.use("/todos/*", ...)`
- `app.get("/todos", listTodos)`, `app.post("/todos", createTodo)`, etc.
- `app.post("/todos/sync", syncTodos)` (registered before `:id` routes)
- `app.put("/todos/:id", updateTodo)`, `app.delete("/todos/:id", deleteTodo)`
- Keep `export { UserSync }` for the Durable Object
- Export `app` as default

### Update handlers to use Hono context

Refactor `src/api/src/handlers/todos.ts` and `src/api/src/handlers/sync.ts`:
- Change signatures from `(req: AuthenticatedRequest, env: Env, todoId?: string)` to `(c: Context) => ...`
- Get `userId` from `c.get("userId")` (set by auth middleware)
- Get `env` from `c.env`
- Get route params from `c.req.param("id")`
- Use `c.json()` for responses instead of custom `json()` helper

### Update `src/api/src/lib/response.ts`

Simplify - CORS can be handled by Hono's `cors()` middleware. Keep `unauthorized()`, `notFound()`, `error()` as Hono-compatible helpers or replace with `c.json({ error }, status)` inline.

### Update `src/api/src/lib/auth.ts`

Convert to a Hono middleware that sets `userId` on the context.

### Update `src/api/src/types.ts`

Remove `AuthenticatedRequest` (replaced by Hono's typed context). Update `Env` type to work with Hono's `Bindings` type.

### Files modified
- `src/api/package.json` - add `hono`
- `src/api/src/index.ts` - full rewrite to Hono app
- `src/api/src/handlers/todos.ts` - use Hono context
- `src/api/src/handlers/sync.ts` - use Hono context
- `src/api/src/lib/auth.ts` - convert to middleware
- `src/api/src/lib/response.ts` - simplify or remove
- `src/api/src/types.ts` - update types for Hono bindings
- `src/api/src/durable-objects/UserSync.ts` - no changes expected

---

## Phase 2: API Test Suite (Vitest + `@cloudflare/vitest-pool-workers`)

### Why this framework
`@cloudflare/vitest-pool-workers` runs tests inside the Workers runtime (Miniflare), giving real D1, Durable Objects, and WebSocket support. Consistent with the web project (both Vitest).

### Install dependencies
Add to `src/api/package.json` devDependencies:
- `vitest` (~3.0.5, matching web)
- `@cloudflare/vitest-pool-workers`

Add script: `"test": "vitest run"`

### New files

```
src/api/
  vitest.config.ts                    # defineWorkersConfig with D1 migrations
  test/
    tsconfig.json                     # Extends parent, adds pool-workers types
    apply-migrations.ts               # Setup: applies D1 migrations before suites
    helpers.ts                        # Shared utilities (seed user, auth mock)
    unit/
      auth.test.ts                    # Auth middleware unit tests
    integration/
      routing.test.ts                 # Route matching, CORS, 404s
      todos-crud.test.ts              # Full CRUD against real D1
      sync.test.ts                    # Sync with conflict resolution
      durable-object.test.ts          # UserSync WebSocket broadcast
```

### Configuration

**`vitest.config.ts`**: Uses `defineWorkersConfig` with `readD1Migrations` from `src/web/migrations/`, configures D1 and Durable Object bindings to match `wrangler.jsonc`.

**`test/apply-migrations.ts`**: Calls `applyD1Migrations` in a setup function before each suite.

### Mocking strategy
- **D1/Drizzle**: Real (Miniflare provides local SQLite)
- **Durable Objects**: Real (pool-workers instantiates actual `UserSync` class)
- **WebSocketPair**: Real (native Workers API)
- **Clerk JWT verification**: Mock via `vi.mock` (external service)
- **Zod, fractional-indexing**: Real (pure computation)

### Test coverage

**Unit - `auth.test.ts`**: Middleware sets userId on context for valid JWT, returns 401 for missing/invalid token.

**Integration - `routing.test.ts`**: OPTIONS returns CORS headers, health endpoints work without auth, unknown paths return 404, auth-protected routes return 401 without token.

**Integration - `todos-crud.test.ts`**: Create with valid/invalid data, list todos, update title/completed/position, delete, ownership isolation between users, 404 for non-existent todos.

**Integration - `sync.test.ts`**: First sync returns all todos, create/update/delete via sync, last-write-wins conflict resolution, UUID normalization (uppercase -> lowercase), auto-creates user via Clerk lookup.

**Integration - `durable-object.test.ts`**: WebSocket upgrade returns 101, `/notify` broadcasts to all connections, client "changed" message broadcasts to OTHER connections only, graceful disconnect handling.

---

## Phase 3: Web Test Suite (Vitest + Testing Library)

### Current state
`vitest@^3.0.5`, `@testing-library/react`, `@testing-library/dom`, `jsdom` already installed. No config or test files.

### Install additional dependency
- `@testing-library/jest-dom` (for `toBeInTheDocument` etc.)

### New files

```
src/web/
  vitest.config.ts                          # Separate from vite.config.ts (no Cloudflare/TanStack plugins)
  src/
    test/
      setup.ts                              # jest-dom matchers, cleanup
      helpers.tsx                            # QueryClient + WebSocket context wrapper
    lib/__tests__/
      validation.test.ts                    # Zod schema tests
      errors.test.ts                        # Effect tagged error tests
    components/__tests__/
      TodoPreview.test.tsx                  # Pure presentational component
      TodoInput.test.tsx                    # Form interactions
      TodoList.test.tsx                     # List rendering with mocked hooks
      LandingPage.test.tsx                  # Smoke test
      Header.test.tsx                       # Smoke test
    hooks/__tests__/
      useTodos.test.ts                      # React Query hooks with mocked server fns
```

### Configuration

**`vitest.config.ts`**: Must be SEPARATE from `vite.config.ts` (which has Cloudflare/TanStack plugins incompatible with jsdom). Uses `vite-tsconfig-paths` for `@/*` alias resolution, `environment: "jsdom"`, and the setup file.

**`src/test/setup.ts`**: Imports `@testing-library/jest-dom/vitest`, runs `cleanup()` after each test.

**`src/test/helpers.tsx`**: Provides `TestWrapper` component with `QueryClientProvider` (retry: false) and mock `WebSocketSyncContext`.

### Mocking strategy
- **Server functions** (`@/server/todos`, `@/server/ai`): Mock (tied to TanStack Start runtime)
- **`@clerk/tanstack-react-start`**: Mock (`useAuth`, `SignedIn`, `SignedOut`)
- **`@cloudflare/kumo`**: Mock (render as basic HTML elements)
- **`@dnd-kit/*`**: Mock (render children directly)
- **React Query**: Real (with test QueryClient)
- **Zod, Effect**: Real (pure computation)

### Test coverage

**`validation.test.ts`**: createTodoSchema accepts/rejects various inputs, updateTodoSchema partial updates, dueDate handling.

**`errors.test.ts`**: Each tagged error has correct `_tag`, stores expected properties.

**`TodoPreview.test.tsx`**: Renders extracted todos, selection toggle, select all/deselect, edit title, remove todo, confirm button states.

**`TodoInput.test.tsx`**: Renders textarea, submit calls createTodo, AI extraction flow, loading states.

**`TodoList.test.tsx`**: Loading/error/empty states, renders items, completed styling, checkbox toggle, edit/delete interactions.

**`useTodos.test.ts`**: Query fetches data, mutations call server functions, optimistic updates, rollback on error, WebSocket notification on success.

---

## Phase 4: iOS Test Suite (Swift Testing)

### Why Swift Testing
The project targets iOS 26+ and uses modern Swift concurrency (async/await, actors). Swift Testing's `@Test` macro and `#expect` integrate naturally. XCTest can coexist if needed for UI tests later.

### Xcode project changes
Add a "Unit Testing Bundle" target named `Nylon ImpossibleTests` in Xcode (File > New > Target). This creates the test target, build settings, and default file automatically.

### Production code changes for testability
Extract protocols for dependency injection (minimal changes):

**`AuthProviding`** protocol (in `AuthService.swift`):
```swift
protocol AuthProviding {
    var isSignedIn: Bool { get }
    var userId: String? { get }
    func getToken() async throws -> String
}
extension AuthService: AuthProviding {}
```

**`APIProviding`** protocol (in `APIService.swift`):
```swift
protocol APIProviding: Sendable {
    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse
}
extension APIService: APIProviding {}
```

Update `SyncService` init to accept `any AuthProviding` and `any APIProviding` instead of concrete types.

### New files

```
src/ios/Nylon Impossible/Nylon ImpossibleTests/
  FractionalIndexingTests.swift         # Pure algorithm tests
  TodoItemTests.swift                   # SwiftData model tests
  TodoViewModelTests.swift              # ViewModel logic with in-memory SwiftData
  APIServiceTests.swift                 # Codable encoding/decoding tests
  SyncServiceTests.swift                # Sync logic with mock API + in-memory SwiftData
  Mocks/
    MockAuthService.swift               # Mock conforming to AuthProviding
    MockAPIService.swift                # Mock conforming to APIProviding
```

### Mocking strategy
- **SwiftData**: Real (in-memory `ModelContainer`)
- **AuthService**: Protocol + mock (`MockAuthService`)
- **APIService**: Protocol + mock (`MockAPIService`)
- **Clerk**: Not tested directly (mocked at AuthService level)
- **UserDefaults**: Real (separate suite name for tests)
- **FractionalIndexing**: Real (pure computation)

### Test coverage

**`FractionalIndexingTests.swift`**: `generateKeyBetween(nil, nil)` returns "a0", keys between two values sort correctly, 100 sequential keys maintain order, cross-platform consistency with npm library.

**`TodoItemTests.swift`**: Init sets correct defaults, `markModified()` updates timestamp and clears isSynced.

**`TodoViewModelTests.swift`**: `canAddTask` logic, `addTodo` creates item and clears input, `sortedTodos` filters deleted + sorts correctly, `toggleTodo`/`deleteTodo`/`moveTodo` behavior.

**`APIServiceTests.swift`**: `SyncRequest` encodes with ISO 8601 dates, `SyncResponse` decodes ISO 8601 and Unix timestamps, `TodoChange` encodes nil fields correctly.

**`SyncServiceTests.swift`**: Skips sync when not signed in, gathers unsynced local changes, applies remote changes (create/update/conflict resolution), cleans up synced soft-deleted items.

---

## Phase 5: CI Integration

### New workflow: `.github/workflows/test.yml`

Runs on all PRs and pushes to main. Three parallel jobs:

- **test-api**: `ubuntu-latest`, Node 22, `pnpm --filter @nylon-impossible/api test`
- **test-web**: `ubuntu-latest`, Node 22, `pnpm --filter @nylon-impossible/web test`
- **test-ios**: `macos-26`, `xcodebuild test` with iOS Simulator destination

No secrets needed (auth is mocked in all projects).

### Root package.json
Add `"test": "pnpm --filter @nylon-impossible/web test && pnpm --filter @nylon-impossible/api test"` script for local convenience.

---

## Implementation Order

1. **API Hono migration** - Rewrite routing, handlers, auth middleware, types
2. **API test infra + tests** - Config, setup, unit tests, integration tests
3. **Web test infra + tests** - Config, setup, validation/error tests, component tests, hook tests
4. **iOS test target + tests** - Xcode target, protocol extraction, model/viewmodel/sync tests
5. **CI workflow** - `.github/workflows/test.yml`

## Verification

- API: `cd src/api && pnpm test` - all tests pass
- Web: `cd src/web && pnpm test` - all tests pass
- iOS: `xcodebuild test` in Xcode or via CLI with simulator destination
- CI: Open a PR and verify all three test jobs pass in GitHub Actions
