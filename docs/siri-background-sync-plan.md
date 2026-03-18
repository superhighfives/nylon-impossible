# Plan: Background Sync When Adding Items via Siri

## Problem

When a user adds a task via Siri ("Hey Siri, add X to Nylon"), `AddTaskIntent.perform()` runs in a **separate extension process** — not the main app. It writes the `TodoItem` to SwiftData (via the shared App Group container) with `isSynced = false`, but no sync ever happens. The item only reaches the server the next time the user opens the app and `SyncService.sync()` runs.

**Impact:** Tasks added via Siri are invisible to other devices (web, other iOS devices) until the app is manually opened.

---

## Current Architecture Summary

| Component | Where | What it does |
|-----------|-------|-------------|
| `AddTaskIntent` | App extension process | Creates `TodoItem` in SwiftData; reads `currentUserId` from App Group UserDefaults |
| `TaskCreationService` | Shared (main app + extensions) | Inserts `TodoItem` into SwiftData, saves context |
| `SyncService` | Main app process only | Full sync logic; depends on `AuthService` (Clerk), WebSocket, `@Observable` |
| `AuthService` | Main app process only | Clerk JWT; saves `currentUserId` to App Group UserDefaults |
| `SharedModelContainer` | App Group | SwiftData store shared between main app and extensions |

The root issue is that `SyncService` is a heavyweight `@MainActor @Observable` class wired to Clerk — it cannot run inside an App Intent extension.

---

## Proposed Solution

Two complementary mechanisms:

1. **Direct sync from the intent** — attempt an HTTP sync immediately inside `AddTaskIntent.perform()` using a lightweight helper that reads credentials from shared storage.
2. **BGAppRefreshTask fallback** — if the direct sync fails or credentials are unavailable, schedule a background task so the OS wakes the main app to sync when conditions allow.

---

## Step-by-Step Implementation

### Step 1 — Persist the auth token to shared storage

**File: `AuthService.swift`**

The main app already writes `currentUserId` to App Group UserDefaults after sign-in. Extend `persistUserIdToSharedDefaults()` to also write (and keep refreshed) the current Clerk JWT.

```swift
// In AuthService.persistUserIdToSharedDefaults()
let token = try? await Clerk.shared.session?.getToken()
sharedDefaults?.set(token?.jwt, forKey: "currentAuthToken")
sharedDefaults?.set(Date().addingTimeInterval(50 * 60), forKey: "currentAuthTokenExpiry")
// 50 min to be safe — Clerk tokens typically expire at 60 min
```

Also clear the token on sign-out in `clearUserIdFromSharedDefaults()`:

```swift
sharedDefaults?.removeObject(forKey: "currentAuthToken")
sharedDefaults?.removeObject(forKey: "currentAuthTokenExpiry")
```

**Security note:** Storing a short-lived JWT in App Group UserDefaults is the standard pattern for sharing credentials with extensions. Tokens expire in ~1 hour and cannot be refreshed from the extension (no Clerk session). This is acceptable for the use case.

To keep the token fresh, also refresh it:
- Each time the app enters the foreground (in the `.active` scene phase handler).
- After a successful sync.

---

### Step 2 — Create `BackgroundSyncService`

**New file: `Services/BackgroundSyncService.swift`**

A minimal, dependency-free sync helper that can run inside any process (intent extension, BGTask handler, main app). It has no `@Observable`, no Clerk dependency, no WebSocket.

```swift
import Foundation
import SwiftData

struct BackgroundSyncService {
    private let apiBaseURL: String
    private let authToken: String
    private let userId: String

    init?(sharedDefaults: UserDefaults) {
        guard
            let baseURL = Config.apiBaseURL.absoluteString as String?,
            let token = sharedDefaults.string(forKey: "currentAuthToken"),
            let userId = sharedDefaults.string(forKey: "currentUserId"),
            let expiry = sharedDefaults.object(forKey: "currentAuthTokenExpiry") as? Date,
            expiry > Date()
        else { return nil }           // nil if no valid credentials

        self.apiBaseURL = baseURL
        self.authToken = token
        self.userId = userId
    }

    /// Gather unsynced items and POST them to /todos/sync.
    func sync(modelContainer: ModelContainer) async throws {
        let context = ModelContext(modelContainer)

        // 1. Gather unsynced items
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && !$0.isSynced }
        )
        let unsynced = try context.fetch(descriptor)
        guard !unsynced.isEmpty else { return }

        let changes = unsynced.map { todo in
            TodoChange(
                id: todo.id.uuidString.lowercased(),
                title: todo.isDeleted ? nil : todo.title,
                description: todo.isDeleted ? nil : todo.itemDescription,
                completed: todo.isDeleted ? nil : todo.isCompleted,
                position: todo.isDeleted ? nil : todo.position,
                dueDate: todo.isDeleted ? nil : todo.dueDate,
                priority: todo.isDeleted ? nil : todo.priority,
                updatedAt: todo.updatedAt,
                deleted: todo.isDeleted ? true : nil
            )
        }

        // 2. POST to /todos/sync
        let url = URL(string: "\(apiBaseURL)/todos/sync")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = SyncRequest(lastSyncedAt: nil, changes: changes)
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        // 3. Mark items as synced
        let syncedIds = Set(changes.map { $0.id })
        for todo in unsynced {
            if syncedIds.contains(todo.id.uuidString.lowercased()) {
                todo.isSynced = true
            }
        }
        try context.save()
    }
}
```

**What it does NOT do** (intentionally kept minimal):
- Does not apply remote changes (avoids conflicts in the extension process).
- Does not update `lastSyncedAt` (main app handles this on next foreground sync).
- Does not notify WebSocket (main app will send `changed` on next open).

The full bidirectional reconciliation happens the next time the main app is in the foreground and `SyncService.sync()` runs normally.

---

### Step 3 — Call `BackgroundSyncService` from `AddTaskIntent`

**File: `Intents/AddTaskIntent.swift`**

After creating the task, attempt an immediate sync:

```swift
@MainActor
func perform() async throws -> some IntentResult & ProvidesDialog {
    let container = SharedModelContainer.shared
    let context = ModelContext(container)

    let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
    let userId: String? = sharedDefaults?.string(forKey: "currentUserId")

    let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
    let todo = TaskCreationService.createTask(
        title: task.title,
        userId: userId,
        context: context,
        allTodos: allTodos
    )

    // Attempt immediate background sync
    if let syncService = BackgroundSyncService(sharedDefaults: sharedDefaults ?? UserDefaults.standard) {
        do {
            try await syncService.sync(modelContainer: container)
        } catch {
            // Sync failed — schedule a BGAppRefreshTask so the app will sync soon
            scheduleBackgroundSync()
            print("[Siri] Background sync failed, scheduled BGTask: \(error)")
        }
    } else {
        // No valid credentials — schedule fallback
        scheduleBackgroundSync()
    }

    return .result(dialog: "Added '\(todo.title)' to Nylon")
}

private func scheduleBackgroundSync() {
    let request = BGAppRefreshTaskRequest(identifier: "com.nylonimpossible.backgroundsync")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 60) // at least 1 min out
    try? BGTaskScheduler.shared.submit(request)
}
```

Add `import BackgroundTasks` at the top of `AddTaskIntent.swift`.

---

### Step 4 — Register and handle the BGAppRefreshTask

**File: `Nylon_ImpossibleApp.swift`**

Register the task handler at launch and handle it when iOS wakes the app:

```swift
import BackgroundTasks

@main
struct Nylon_ImpossibleApp: App {
    @State private var authService = AuthService()
    @State private var syncService: SyncService?

    init() {
        Clerk.configure(publishableKey: Config.clerkPublishableKey)
        registerBackgroundTasks()
    }

    // ...existing body...
}

// MARK: - Background Tasks
extension Nylon_ImpossibleApp {
    private func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.nylonimpossible.backgroundsync",
            using: nil
        ) { task in
            self.handleBackgroundSync(task: task as! BGAppRefreshTask)
        }
    }

    private func handleBackgroundSync(task: BGAppRefreshTask) {
        // Schedule the next refresh while this one runs
        scheduleNextBackgroundSync()

        let syncTask = Task {
            guard let syncService else { return }
            await syncService.sync()
        }

        task.expirationHandler = {
            syncTask.cancel()
        }

        Task {
            await syncTask.value
            task.setTaskCompleted(success: true)
        }
    }

    private func scheduleNextBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: "com.nylonimpossible.backgroundsync")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 min
        try? BGTaskScheduler.shared.submit(request)
    }
}
```

---

### Step 5 — Add `BGTaskSchedulerPermittedIdentifiers` to Info.plist

**File: `Nylon-Impossible-Info.plist`**

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.nylonimpossible.backgroundsync</string>
</array>
```

This is required for `BGTaskScheduler` to accept the registration.

---

### Step 6 — Keep the token fresh

**File: `Nylon_ImpossibleApp.swift` (RootView, scene phase handler)**

In the `.active` case, refresh the token in shared storage:

```swift
case .active:
    syncService.connectWebSocket()
    Task {
        await authService.persistUserIdToSharedDefaults() // already refreshes token
    }
```

---

## Sync Flow After This Change

```
User: "Hey Siri, add Buy milk to Nylon"
  │
  ▼
AddTaskIntent.perform()
  ├─ Creates TodoItem in SwiftData (isSynced = false)
  ├─ [token valid] BackgroundSyncService.sync()
  │     ├─ POSTs unsynced items to /todos/sync
  │     ├─ Marks items isSynced = true
  │     └─ Returns ✓
  │
  └─ [token expired / no network] scheduleBackgroundSync()
        └─ BGAppRefreshTaskRequest submitted
              └─ iOS wakes app in background (best-effort, ~few minutes)
                    └─ SyncService.sync() runs full bidirectional sync
```

---

## Files Changed

| File | Change |
|------|--------|
| `Services/AuthService.swift` | Persist + refresh JWT token in shared UserDefaults |
| `Services/BackgroundSyncService.swift` | **New** — lightweight one-way sync for extension/BGTask contexts |
| `Intents/AddTaskIntent.swift` | Call `BackgroundSyncService` after task creation; schedule BGTask fallback |
| `Nylon_ImpossibleApp.swift` | Register + handle `BGAppRefreshTask`; refresh token on foreground |
| `Nylon-Impossible-Info.plist` | Add `BGTaskSchedulerPermittedIdentifiers` |

---

## Trade-offs and Notes

- **Token security:** Storing a short-lived JWT in App Group UserDefaults is the standard extension credential-sharing pattern. The token is automatically invalidated by Clerk after expiry, so there's no persistent credential risk.
- **One-way sync from intent:** `BackgroundSyncService` only uploads local changes — it does not download remote changes. This is intentional: downloading and merging in the extension process risks write conflicts with the main app. The full sync on next foreground open handles reconciliation.
- **BGAppRefreshTask is best-effort:** iOS decides when to actually run the task based on battery, network, and usage patterns. This is a fallback, not a guarantee. The direct sync in Step 3 is the primary path.
- **No Clerk token refresh from extension:** Clerk's session token can only be refreshed with an active session in the main app. The 50-minute expiry window written in Step 1 ensures the token remains valid for any Siri invocations within an hour of last app use. If the token is expired, the BGTask fallback handles it.
