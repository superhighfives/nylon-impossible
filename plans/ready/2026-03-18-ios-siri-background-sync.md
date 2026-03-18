# iOS Siri Background Sync

**Date:** 2026-03-18
**Status:** Ready
**Scope:** iOS

## Problem

When a user adds a task via Siri ("Hey Siri, add X to Nylon"), `AddTaskIntent.perform()` runs in a **separate extension process** — not the main app. It writes the `TodoItem` to SwiftData with `isSynced = false`, but no sync is ever triggered. The item only reaches the server the next time the user manually opens the app and `SyncService.sync()` runs.

Tasks added via Siri are invisible to other devices (web, other iOS devices) until the app is opened.

## Solution

Two complementary mechanisms:

1. **Direct sync from the intent** — attempt an HTTP sync immediately inside `AddTaskIntent.perform()` using a lightweight helper that reads credentials from shared App Group storage.
2. **BGAppRefreshTask fallback** — if the direct sync fails or credentials are unavailable, schedule a background task so iOS wakes the main app to sync when conditions allow.

The key constraint is that `SyncService` is a heavyweight `@MainActor @Observable` class tied to Clerk — it cannot run inside an App Intent extension process. A separate lightweight service is needed.

## Implementation

### Files to modify

- `Services/AuthService.swift` — also persist the Clerk JWT (with expiry) to shared App Group UserDefaults, and clear it on sign-out
- `Intents/AddTaskIntent.swift` — call `BackgroundSyncService` after task creation; schedule BGTask as fallback
- `Nylon_ImpossibleApp.swift` — register and handle `BGAppRefreshTask`; refresh token when app enters foreground
- `Nylon-Impossible-Info.plist` — add `BGTaskSchedulerPermittedIdentifiers`

### Files to create

- `Services/BackgroundSyncService.swift` — lightweight one-way sync usable from extension and BGTask contexts

### BackgroundSyncService

A minimal, dependency-free struct with no `@Observable`, no Clerk dependency, no WebSocket. Initialises from shared UserDefaults; returns `nil` if credentials are missing or expired.

```swift
struct BackgroundSyncService {
    private let apiBaseURL: String
    private let authToken: String
    private let userId: String

    init?(sharedDefaults: UserDefaults) {
        guard
            let token = sharedDefaults.string(forKey: "currentAuthToken"),
            let userId = sharedDefaults.string(forKey: "currentUserId"),
            let expiry = sharedDefaults.object(forKey: "currentAuthTokenExpiry") as? Date,
            expiry > Date()
        else { return nil }

        self.apiBaseURL = Config.apiBaseURL.absoluteString
        self.authToken = token
        self.userId = userId
    }

    func sync(modelContainer: ModelContainer) async throws {
        // 1. Fetch unsynced items for userId
        // 2. POST to /todos/sync with Bearer token
        // 3. Mark items isSynced = true on 2xx
    }
}
```

Intentionally **one-way only** (uploads; does not apply remote changes). This avoids write conflicts with the main app process. Full bidirectional reconciliation happens the next time the main app is foregrounded and `SyncService.sync()` runs normally.

### Token persistence

`AuthService.persistUserIdToSharedDefaults()` already writes `currentUserId`. Extend it to also write the Clerk JWT and an expiry timestamp (~50 minutes, conservative against Clerk's 60-minute default):

```swift
let token = try? await Clerk.shared.session?.getToken()
sharedDefaults?.set(token?.jwt, forKey: "currentAuthToken")
sharedDefaults?.set(Date().addingTimeInterval(50 * 60), forKey: "currentAuthTokenExpiry")
```

Call `persistUserIdToSharedDefaults()` on the `.active` scene phase transition (in addition to sign-in) to keep the token fresh.

Clear both keys in `clearUserIdFromSharedDefaults()` on sign-out.

### AddTaskIntent changes

After task creation, attempt immediate sync; schedule a BGTask as fallback:

```swift
if let svc = BackgroundSyncService(sharedDefaults: sharedDefaults) {
    do {
        try await svc.sync(modelContainer: container)
    } catch {
        scheduleBackgroundSync()
    }
} else {
    scheduleBackgroundSync()
}
```

### BGAppRefreshTask registration

In `Nylon_ImpossibleApp.init()`:

```swift
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.nylonimpossible.backgroundsync",
    using: nil
) { task in
    handleBackgroundSync(task: task as! BGAppRefreshTask)
}
```

The handler calls `syncService.sync()`, sets `task.setTaskCompleted(success:)`, and schedules the next refresh (15-minute minimum interval).

### Info.plist

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.nylonimpossible.backgroundsync</string>
</array>
```

### Key considerations

- **Token security**: storing a short-lived JWT in App Group UserDefaults is the standard extension credential-sharing pattern. Tokens expire in ~1 hour and cannot be refreshed from within an extension.
- **One-way sync only from the extension**: downloading and merging remote changes in the extension process risks SwiftData write conflicts with the main app. Uploads only; the main app handles reconciliation on next foreground open.
- **BGAppRefreshTask is best-effort**: iOS schedules it based on battery, network, and usage patterns. The direct sync in `AddTaskIntent` is the primary path; the BGTask is the fallback.
- **No Clerk token refresh from extension**: the 50-minute expiry window covers any Siri invocation within an hour of last app use. If expired, the BGTask fallback handles it via the full `SyncService`.

## Acceptance criteria

- [ ] Adding a task via Siri syncs it to the server without opening the app (when the auth token is valid)
- [ ] Adding a task via Siri schedules a BGAppRefreshTask when the direct sync fails or credentials are expired
- [ ] The BGAppRefreshTask runs `SyncService.sync()` and completes successfully
- [ ] Auth token in shared UserDefaults is refreshed each time the app enters the foreground
- [ ] Auth token is cleared from shared UserDefaults on sign-out
- [ ] No SwiftData write conflicts between the extension and main app processes
- [ ] Existing Siri task creation flow is unchanged when offline

## Dependencies

- Related to: `plans/done/2026-03-02-siri-integration.md`
- Related to: `plans/done/2026-03-13-siri-inline-parameters.md`
