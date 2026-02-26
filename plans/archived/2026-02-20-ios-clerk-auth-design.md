# iOS Clerk authentication and data sync

**Date**: 2026-02-20
**Status**: Complete

Add Clerk authentication to the iOS app and sync todos between web and iOS via a shared D1 database.

## Goals

- iOS users can sign in with Clerk (same accounts as web)
- Todos sync between web and iOS
- iOS works offline with local SwiftData cache
- Simple, maintainable architecture

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare                               │
│  ┌─────────────────────┐         ┌─────────────────────────┐   │
│  │   Web App Worker    │         │     API Worker          │   │
│  │  (TanStack Start)   │         │  api.nylonimpossible.com│   │
│  │                     │         │                         │   │
│  │  - Web UI           │         │  - JWT verification     │   │
│  │  - Server functions │         │  - REST endpoints       │   │
│  └──────────┬──────────┘         └────────────┬────────────┘   │
│             │                                  │                │
│             └──────────────┬───────────────────┘                │
│                            ▼                                    │
│                    ┌───────────────┐                            │
│                    │   D1 Database │                            │
│                    │   (shared)    │                            │
│                    └───────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
                            ▲
            ┌───────────────┴───────────────┐
            │                               │
     ┌──────┴──────┐                 ┌──────┴──────┐
     │   Web App   │                 │   iOS App   │
     │  (Browser)  │                 │  (SwiftUI)  │
     │             │                 │             │
     │ Clerk Auth  │                 │ Clerk Auth  │
     │ (sessions)  │                 │ (JWT)       │
     └─────────────┘                 └─────────────┘
```

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API approach | Separate API Worker | Keeps iOS independent from web app |
| Sync strategy | Offline-first with SwiftData | Best mobile UX, app works without network |
| Data model | Full schema including `position` and `dueDate` | Matches web schema for complete sync |
| Conflict resolution | Last write wins (`updatedAt`) | Simple, predictable, good enough for todos |
| Sync triggers | Polling (5s) + debounced action sync (500ms) | Near-realtime feel without websockets |
| Ordering | Fractional indexing | Consistent with web, supports drag-and-drop reorder |
| Environment config | Conditional compilation (`#if targetEnvironment(simulator)`) | Different Clerk keys and API URLs for dev vs prod |

---

## API Worker

A lightweight Cloudflare Worker providing REST endpoints for the iOS app.

### Location

```
src/api/
├── src/
│   ├── index.ts          # Worker entry, routing, CORS
│   ├── handlers/
│   │   ├── todos.ts      # Todo CRUD handlers
│   │   └── sync.ts       # Bidirectional sync handler
│   ├── lib/
│   │   ├── auth.ts       # Clerk JWT verification
│   │   ├── db.ts         # D1 Drizzle database helpers
│   │   └── response.ts   # Response helpers
│   └── types.ts          # TypeScript types
├── wrangler.jsonc
├── package.json
└── tsconfig.json
```

### Dependencies

- `@clerk/backend` - JWT verification
- `drizzle-orm` - Database ORM (mirrors web schema)
- `fractional-indexing` - Todo ordering
- `zod` - Request validation

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` or `/health` | Health check (unauthenticated) |
| `GET` | `/todos` | List all todos for authenticated user |
| `POST` | `/todos` | Create a new todo |
| `PUT` | `/todos/:id` | Update a todo |
| `DELETE` | `/todos/:id` | Delete a todo |
| `POST` | `/todos/sync` | Bulk bidirectional sync endpoint |
| `OPTIONS` | `*` | CORS preflight |

All endpoints except health check require `Authorization: Bearer <clerk_jwt>` header.

### Sync endpoint

The `/todos/sync` endpoint handles bidirectional sync in a single round trip:

```typescript
// Request
POST /todos/sync
{
  "lastSyncedAt": "2026-02-20T10:00:00Z",  // null for first sync
  "changes": [
    { "id": "...", "title": "...", "completed": false, "updatedAt": "...", "deleted": false },
    { "id": "...", "deleted": true, "updatedAt": "..." }
  ]
}

// Response
{
  "todos": [...],           // All todos updated since lastSyncedAt
  "syncedAt": "2026-02-20T10:05:00Z",
  "conflicts": [...]        // Any conflicts (for logging/debugging)
}
```

The sync handler also auto-creates user records from Clerk JWT claims on first sync.

### Environment bindings

```jsonc
// wrangler.jsonc
{
  "name": "nylon-impossible-api",
  "compatibility_date": "2025-09-02",
  "routes": [{ "pattern": "api.nylonimpossible.com", "custom_domain": true }],
  "d1_databases": [{
    "binding": "DB",
    "database_name": "nylon-impossible-db",
    "database_id": "<shared-with-web>",
    "migrations_dir": "../web/migrations"
  }]
}
```

Secrets (set via `wrangler secret put`): `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`.

---

## iOS app

### Dependencies

Clerk iOS SDK via Swift Package Manager:
- `https://github.com/clerk/clerk-ios` (imports: `ClerkKit`, `ClerkKitUI`)

### File structure

```
src/ios/Nylon Impossible/Nylon Impossible/
├── Models/
│   └── TodoItem.swift              # SwiftData model with sync fields
├── Services/
│   ├── AuthService.swift           # Clerk authentication (@Observable, @MainActor)
│   ├── APIService.swift            # REST API client (actor-based)
│   ├── SyncService.swift           # Sync orchestration (@Observable, @MainActor)
│   └── Config.swift                # Environment config (simulator vs device)
├── ViewModels/
│   └── TodoViewModel.swift         # Todo state management
├── Views/
│   ├── Auth/
│   │   └── SignInView.swift        # Login UI with Clerk AuthView sheet
│   ├── Components/
│   │   ├── TodoItemRow.swift
│   │   ├── HeaderView.swift
│   │   ├── AddTaskInputView.swift
│   │   ├── EmptyStateView.swift
│   │   ├── GradientBackground.swift
│   │   └── Color+Hex.swift
│   └── ContentView.swift
├── Utils/
│   └── FractionalIndexing.swift    # Fractional indexing for todo ordering
└── Nylon_ImpossibleApp.swift       # App entry point with auth flow
```

### Data model

```swift
// Models/TodoItem.swift
@Model
final class TodoItem {
    var id: UUID
    var userId: String?         // Clerk user ID (optional for pre-auth local todos)
    var title: String
    var isCompleted: Bool
    var createdAt: Date
    var updatedAt: Date         // For conflict resolution
    var isSynced: Bool          // Local sync state tracking
    var isDeleted: Bool         // Soft delete for sync
    var position: String        // Fractional indexing for ordering

    func markModified()         // Updates updatedAt and clears isSynced
}
```

### Config

```swift
// Services/Config.swift
enum Config {
    #if targetEnvironment(simulator)
    static let clerkPublishableKey = "pk_test_..."
    static let apiBaseURL = URL(string: "http://localhost:8787")!
    #else
    static let clerkPublishableKey = "pk_live_..."
    static let apiBaseURL = URL(string: "https://api.nylonimpossible.com")!
    #endif
}
```

### Auth service

```swift
// Services/AuthService.swift
@Observable
@MainActor
final class AuthService {
    var isSignedIn: Bool        // Derived from Clerk.shared session state
    var userId: String?
    var userEmail: String?

    func getToken() async throws -> String  // Get JWT for API calls
    func signOut() async                    // Sign out and clear state
}
```

Accesses `Clerk.shared` lazily. Sign-in is handled by Clerk's native `AuthView` presented as a sheet from `SignInView`.

### API service

```swift
// Services/APIService.swift
actor APIService {
    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse
    func listTodos() async throws -> [APITodo]
    func createTodo(id: UUID, title: String) async throws -> APITodo
    func updateTodo(id: UUID, title: String?, completed: Bool?, updatedAt: Date) async throws -> APITodo
    func deleteTodo(id: UUID) async throws
}
```

Actor-based for thread safety. Handles custom date decoding (ISO 8601, Unix timestamps in seconds and milliseconds). 30s request timeout, 60s resource timeout.

### Sync service

```swift
// Services/SyncService.swift
@Observable
@MainActor
final class SyncService {
    enum SyncState { case idle, syncing, success(Date), error(String) }

    func sync() async                       // Full bidirectional sync
    func syncAfterAction()                  // Debounced sync (500ms) after user changes
    func startPolling()                     // Poll every 5s when app is active
    func stopPolling()                      // Stop polling on background
    func migrateLocalTodos() async          // Migrate pre-auth todos to user account
}
```

Sync algorithm:
1. Gather unsynced local changes for current user
2. Send to server with `lastSyncedAt`
3. Apply remote changes (last-write-wins based on `updatedAt`)
4. Mark sent items as synced
5. Remove synced items no longer on server (server-side deletions)
6. Clean up soft-deleted synced items locally
7. Update `lastSyncedAt` (persisted in UserDefaults)

UUID normalization: iOS normalizes UUIDs to lowercase for D1 compatibility.

### App entry point

```swift
// Nylon_ImpossibleApp.swift
@main
struct Nylon_ImpossibleApp: App {
    @State private var authService = AuthService()
    @State private var syncService: SyncService?

    init() {
        Clerk.configure(publishableKey: Config.clerkPublishableKey)
    }

    // RootView shows:
    // - Loading state while Clerk initializes
    // - SignInView if not authenticated
    // - ContentView with sync service if authenticated
    // Scene phase handling: starts/stops polling on foreground/background
    // Triggers initial sync + local todo migration on first sign-in
}
```

---

## Implementation plan

### Phase 1: API Worker - Complete

1. ~~Scaffold `src/api/` with Wrangler~~
2. ~~Set up D1 binding (shared database with web)~~
3. ~~Implement Clerk JWT verification with `@clerk/backend`~~
4. ~~Implement `/todos` CRUD endpoints with Drizzle~~
5. ~~Implement `/todos/sync` bidirectional endpoint~~
6. ~~Implement auto user creation from Clerk JWT~~
7. ~~Deploy to `api.nylonimpossible.com`~~

### Phase 2: iOS auth - Complete

1. ~~Add Clerk iOS SDK via SPM (`clerk-ios`)~~
2. ~~Create `AuthService` with `@Observable` and `@MainActor`~~
3. ~~Build `SignInView` with Clerk's native `AuthView` sheet~~
4. ~~Create `Config` for environment-specific settings~~
5. ~~Update app entry point with auth flow and scene phase handling~~

### Phase 3: iOS sync - Complete

1. ~~Update `TodoItem` model with sync fields (`userId`, `updatedAt`, `isSynced`, `isDeleted`, `position`)~~
2. ~~Create actor-based `APIService` with custom date handling~~
3. ~~Create `SyncService` with polling and debounced action sync~~
4. ~~Add sync on app launch and first sign-in~~
5. ~~Add local todo migration on first authentication~~
6. ~~Implement UUID normalization for D1 compatibility~~
7. ~~Add `FractionalIndexing` utility for todo ordering~~
8. ~~Persist `lastSyncedAt` in UserDefaults~~

### Phase 4: Polish - Complete

1. ~~Add `SyncState` enum with loading/success/error states~~
2. ~~Start/stop polling on foreground/background scene phases~~
3. ~~Handle server-side deletions (remove locally synced items not on server)~~
4. ~~Clean up soft-deleted synced items~~
5. ~~Branded `SignInView` with gradient background and logo~~

---

## Resolved questions

- **Clerk iOS SDK setup**: Uses native `AuthView` sheet (not custom email/password form)
- **Soft deletes**: `isDeleted` flag on `TodoItem` for sync compatibility
- **Migration**: `migrateLocalTodos()` auto-uploads pre-auth todos on first sign-in
- **Position field**: Implemented with fractional indexing (originally out of scope)
- **Due date field**: Implemented in schema and synced (originally out of scope)
- **Environment switching**: Conditional compilation for simulator (localhost) vs device (production)

---

## Out of scope

- Push notifications
- Background sync (app must be foregrounded)
- Real-time updates (uses 5s polling instead)
- Shared todos between users
- Sign-up flow (handled by Clerk's built-in `AuthView`)
