# iOS Clerk authentication and data sync

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
| Data model | Minimal - skip `position`, `dueDate` | Reduce scope, can add later |
| Conflict resolution | Last write wins (`updatedAt`) | Simple, predictable, good enough for todos |
| Sync triggers | App launch + pull-to-refresh | Simple, battery-friendly |

---

## API Worker

A lightweight Cloudflare Worker that provides REST endpoints for the iOS app.

### Location

```
src/api/
├── src/
│   ├── index.ts          # Worker entry, routing
│   ├── auth.ts           # Clerk JWT verification
│   ├── handlers/
│   │   └── todos.ts      # Todo CRUD handlers
│   └── lib/
│       └── db.ts         # D1 database helpers
├── wrangler.toml
├── package.json
└── tsconfig.json
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/todos` | List all todos for authenticated user |
| `POST` | `/todos` | Create a new todo |
| `PUT` | `/todos/:id` | Update a todo |
| `DELETE` | `/todos/:id` | Delete a todo |
| `POST` | `/todos/sync` | Bulk sync endpoint (see below) |

All endpoints require `Authorization: Bearer <clerk_jwt>` header.

### Sync endpoint

The `/todos/sync` endpoint handles bidirectional sync efficiently:

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

This reduces network round trips - one request handles push and pull.

### JWT verification

```typescript
// src/api/src/auth.ts
import { verifyToken } from '@clerk/backend';

export async function verifyClerkJWT(token: string, env: Env): Promise<string | null> {
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    return payload.sub; // Clerk user ID
  } catch {
    return null;
  }
}
```

### Environment bindings

```toml
# wrangler.toml
name = "nylon-impossible-api"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "nylon-impossible"
database_id = "<same-id-as-web>"

[vars]
CLERK_PUBLISHABLE_KEY = "pk_..."

# Secret (set via wrangler secret put)
# CLERK_SECRET_KEY
```

---

## iOS changes

### New dependencies

Add Clerk iOS SDK via Swift Package Manager:
- `https://github.com/clerk/clerk-ios` 

### New files

```
src/ios/Nylon Impossible/Nylon Impossible/
├── Services/
│   ├── AuthService.swift      # Clerk authentication
│   ├── APIService.swift       # REST API client
│   └── SyncService.swift      # Sync orchestration
├── Models/
│   └── TodoItem.swift         # Updated with sync fields
└── Views/
    └── Auth/
        ├── SignInView.swift   # Login UI
        └── SignUpView.swift   # Registration UI
```

### Updated data model

```swift
// Models/TodoItem.swift
@Model
final class TodoItem {
    var id: UUID
    var userId: String          // NEW: Clerk user ID
    var title: String
    var isCompleted: Bool
    var createdAt: Date
    var updatedAt: Date         // NEW: for conflict resolution
    var isSynced: Bool          // NEW: local sync state
    var isDeleted: Bool         // NEW: soft delete for sync
    
    init(id: UUID = UUID(), userId: String, title: String) {
        self.id = id
        self.userId = userId
        self.title = title
        self.isCompleted = false
        self.createdAt = Date()
        self.updatedAt = Date()
        self.isSynced = false
        self.isDeleted = false
    }
}
```

### Auth service

```swift
// Services/AuthService.swift
import Clerk

@Observable
final class AuthService {
    private(set) var isSignedIn = false
    private(set) var userId: String?
    
    init() {
        Clerk.configure(publishableKey: "pk_...")
    }
    
    func signIn(email: String, password: String) async throws {
        // Clerk sign in flow
    }
    
    func signOut() async {
        // Clear local data, sign out of Clerk
    }
    
    func getToken() async throws -> String {
        // Get current JWT for API calls
        guard let token = try await Clerk.shared.session?.getToken() else {
            throw AuthError.notAuthenticated
        }
        return token
    }
}
```

### API service

```swift
// Services/APIService.swift
actor APIService {
    private let baseURL = URL(string: "https://api.nylonimpossible.com")!
    private let authService: AuthService
    
    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse {
        let token = try await authService.getToken()
        
        var request = URLRequest(url: baseURL.appendingPathComponent("todos/sync"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(SyncRequest(
            lastSyncedAt: lastSyncedAt,
            changes: changes
        ))
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.syncFailed
        }
        
        return try JSONDecoder().decode(SyncResponse.self, from: data)
    }
}
```

### Sync service

```swift
// Services/SyncService.swift
@Observable
final class SyncService {
    private let apiService: APIService
    private let modelContext: ModelContext
    
    private(set) var isSyncing = false
    private(set) var lastSyncedAt: Date?
    
    func sync() async throws {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        
        // 1. Gather local changes (unsynced items)
        let localChanges = try fetchUnsyncedChanges()
        
        // 2. Send to server, get remote changes
        let response = try await apiService.sync(
            lastSyncedAt: lastSyncedAt,
            changes: localChanges
        )
        
        // 3. Apply remote changes locally (last write wins)
        try applyRemoteChanges(response.todos)
        
        // 4. Mark local items as synced
        try markAsSynced(localChanges)
        
        // 5. Update sync timestamp
        lastSyncedAt = response.syncedAt
    }
    
    private func applyRemoteChanges(_ remoteTodos: [RemoteTodo]) throws {
        for remote in remoteTodos {
            if let local = try fetchLocal(id: remote.id) {
                // Conflict: compare updatedAt, last write wins
                if remote.updatedAt > local.updatedAt {
                    if remote.deleted {
                        modelContext.delete(local)
                    } else {
                        local.title = remote.title
                        local.isCompleted = remote.completed
                        local.updatedAt = remote.updatedAt
                        local.isSynced = true
                    }
                }
            } else if !remote.deleted {
                // New remote item
                let todo = TodoItem(
                    id: remote.id,
                    userId: remote.userId,
                    title: remote.title
                )
                todo.isCompleted = remote.completed
                todo.updatedAt = remote.updatedAt
                todo.isSynced = true
                modelContext.insert(todo)
            }
        }
    }
}
```

### App flow with auth

```swift
// Nylon_ImpossibleApp.swift
@main
struct Nylon_ImpossibleApp: App {
    @State private var authService = AuthService()
    
    var body: some Scene {
        WindowGroup {
            if authService.isSignedIn {
                ContentView()
                    .environment(authService)
            } else {
                SignInView()
                    .environment(authService)
            }
        }
        .modelContainer(for: TodoItem.self)
    }
}
```

---

## Implementation plan

### Phase 1: API Worker

1. Scaffold `src/api/` with Wrangler
2. Set up D1 binding (same database as web)
3. Implement Clerk JWT verification
4. Implement `/todos` CRUD endpoints
5. Implement `/todos/sync` endpoint
6. Deploy to `api.nylonimpossible.com`
7. Test with curl/Postman

### Phase 2: iOS auth

1. Add Clerk iOS SDK
2. Create `AuthService`
3. Build `SignInView` and `SignUpView`
4. Update app entry point with auth flow
5. Test sign in/out flow

### Phase 3: iOS sync

1. Update `TodoItem` model with sync fields
2. Create `APIService`
3. Create `SyncService`
4. Add sync on app launch
5. Add pull-to-refresh
6. Update `TodoViewModel` to mark items as unsynced on changes
7. Handle offline gracefully (queue changes)

### Phase 4: Polish

1. Add loading states during sync
2. Add error handling/retry UI
3. Test conflict resolution
4. Test offline → online flow
5. Add sync status indicator

---

## Resolved questions

- **Clerk iOS SDK setup**: GitHub and email/password sign-in
- **Soft deletes on web**: Yes, add soft deletes for sync compatibility
- **Migration**: Auto-upload local todos to user's account on first sign-in

---

## Out of scope (for now)

- `position` field (manual todo ordering)
- `dueDate` field
- Push notifications
- Background sync
- Real-time updates
- Shared todos between users
