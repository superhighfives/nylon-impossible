//
//  SyncService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation
import Sentry
import SwiftData

enum SyncState: Equatable {
    case idle
    case syncing
    case success(Date)
    case error(String)
}

@Observable
@MainActor
final class SyncService {
    private let authService: any AuthProviding
    private var _apiService: (any APIProviding)?
    // Not `private` — the SyncService+Lists.swift extension (split out to
    // keep this type's body under SwiftLint's length limit) needs to read it.
    var modelContext: ModelContext?
    
    /// Expose API service for direct API calls (e.g. fetching URLs)
    var apiService: APIService? {
        _apiService as? APIService
    }

    private(set) var state: SyncState = .idle
    private(set) var lastSyncedAt: Date?

    let webSocketService: WebSocketService?

    // UserDefaults key for persisting last sync time
    private let lastSyncedAtKey = "com.nylonimpossible.lastSyncedAt"

    init(authService: AuthService) {
        self.authService = authService
        self._apiService = APIService(authService: authService)
        self.webSocketService = WebSocketService(authService: authService)

        // Load last synced time from UserDefaults
        if let timestamp = UserDefaults.standard.object(forKey: lastSyncedAtKey) as? Date {
            lastSyncedAt = timestamp
        }

        // Wire up WebSocket sync callback
        webSocketService?.onSyncNeeded = { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                await self.sync()
            }
        }
    }

    /// Test-friendly initializer that accepts protocol types
    init(authService: any AuthProviding, apiService: any APIProviding) {
        self.authService = authService
        self._apiService = apiService
        self.webSocketService = nil
    }

    func setModelContext(_ context: ModelContext) {
        self.modelContext = context
    }

    /// Trigger a sync after a user action, then notify other clients via WebSocket.
    func syncAfterAction() {
        Task { @MainActor in
            await sync()
            webSocketService?.notifyChanged()
        }
    }

    /// Connect WebSocket. Call when app enters foreground or after sign-in.
    func connectWebSocket() {
        webSocketService?.connect()
    }

    /// Disconnect WebSocket. Call when app enters background or on sign-out.
    func disconnectWebSocket() {
        webSocketService?.disconnect()
    }

    /// Perform a full sync with the server
    func sync() async {
        guard state != .syncing else { return }
        guard authService.isSignedIn, let userId = authService.userId else { return }
        guard modelContext != nil, let apiService = _apiService else { return }

        state = .syncing

        do {
            // 1. Gather local changes (unsynced items for this user)
            let localChanges = try gatherLocalChanges(userId: userId)
            let localChangeIds = Set(localChanges.map { $0.id })

            // 2. Send to server, get remote changes
            // Always request all items (nil lastSyncedAt) so we can detect server-side deletions
            let response = try await apiService.sync(
                lastSyncedAt: nil,
                changes: localChanges
            )

            // 3. Apply all changes in a single atomic operation
            try applySync(
                remoteTodos: response.todos,
                localChangeIds: localChangeIds,
                userId: userId
            )

            // Lists (Today/This Week/Sometime + custom) are server-authoritative
            // and rarely change — a lightweight fetch-and-upsert alongside the
            // main todo sync, not folded into the sync request/response body.
            await syncLists(apiService: apiService, userId: userId)

            // Recompute app icon badge after every sync (due-today / overdue).
            if let modelContext {
                BadgeService.refresh(modelContext: modelContext)
            }

            // 4. Update sync timestamp
            if let syncedAt = ISO8601DateFormatter().date(from: response.syncedAt) {
                lastSyncedAt = syncedAt
                UserDefaults.standard.set(syncedAt, forKey: lastSyncedAtKey)
            }

            // Log conflicts if any
            if !response.conflicts.isEmpty {
                print("[Sync] Conflicts: \(response.conflicts.count)")
                for conflict in response.conflicts {
                    print("[Sync]   - \(conflict.id): \(conflict.resolution)")
                }
            }

            state = .success(Date())

        } catch {
            // Network failures are already reported (or dropped when transient) by
            // APIService; skip them here to avoid a duplicate Sentry issue.
            if !APIError.isNetworkFailure(error), !APIError.isTransientNetworkError(error) {
                SentrySDK.capture(error: error) { scope in
                    scope.setTag(value: "sync", key: "area")
                }
            }
            print("[Sync] Error: \(error)")
            // Transient connectivity blips (request cancelled by backgrounding,
            // offline, timed out) are expected on mobile and retried on the next
            // sync trigger, so they don't earn the error banner — fall back to
            // the last known-good state instead of alarming the user.
            if APIError.isTransientNetworkError(error) {
                state = lastSyncedAt.map { .success($0) } ?? .idle
            } else {
                state = .error(error.localizedDescription)
            }
        }
    }

    /// Migrate existing local todos to the user's account on first sign-in
    func migrateLocalTodos() async {
        guard authService.isSignedIn, let userId = authService.userId else { return }
        guard let modelContext else { return }

        do {
            // Find all local-only todos (no userId)
            let descriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.userId == nil && !$0.isDeleted }
            )
            let localTodos = try modelContext.fetch(descriptor)

            if localTodos.isEmpty { return }

            print("Migrating \(localTodos.count) local todos to user account")

            // Assign userId to all local todos
            for todo in localTodos {
                todo.userId = userId
                todo.isSynced = false
                todo.markModified()
            }

            try modelContext.save()

            // Trigger a sync to upload them
            await sync()

        } catch {
            // Network failures are already reported (or dropped when transient) by
            // APIService; skip them here to avoid a duplicate Sentry issue.
            if !APIError.isNetworkFailure(error), !APIError.isTransientNetworkError(error) {
                SentrySDK.capture(error: error) { scope in
                    scope.setTag(value: "migration", key: "area")
                }
            }
            print("Migration error: \(error)")
        }
    }

    // MARK: - Private Methods

    private func gatherLocalChanges(userId: String) throws -> [TodoChange] {
        guard let modelContext else { return [] }

        // Fetch unsynced items for this user
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && !$0.isSynced }
        )
        let unsyncedItems = try modelContext.fetch(descriptor)

        return unsyncedItems.map { todo in
            let pendingUrlChanges = todo.isDeleted || todo.pendingUrls.isEmpty
                ? nil
                : todo.pendingUrls.map { TodoUrlChange(url: $0) }
            return TodoChange(
                // Normalize UUID to lowercase to match web-generated IDs in D1
                id: todo.id.uuidString.lowercased(),
                // Immutable; honoured only on create, but harmless to resend.
                parentId: todo.isDeleted ? nil : todo.parentId?.uuidString.lowercased(),
                listId: todo.isDeleted ? nil : todo.listKey?.lowercased(),
                title: todo.isDeleted ? nil : todo.title,
                notes: todo.isDeleted ? nil : todo.itemNotes,
                completed: todo.isDeleted ? nil : todo.isCompleted,
                position: todo.isDeleted ? nil : todo.position,
                dueDate: todo.isDeleted ? nil : todo.dueDate,
                recurrence: todo.isDeleted ? nil : todo.recurrence,
                completedAt: todo.isDeleted ? nil : todo.completedAt,
                updatedAt: todo.updatedAt,
                deleted: todo.isDeleted ? true : nil,
                sticky: todo.isDeleted ? nil : todo.sticky,
                urls: pendingUrlChanges
            )
        }
        .orderedForSync()
    }

    /// Apply all sync changes in a single atomic operation
    private func applySync(
        remoteTodos: [APITodo],
        localChangeIds: Set<String>,
        userId: String
    ) throws {
        guard let modelContext else { return }

        let remoteIds = Set(remoteTodos.compactMap { UUID(uuidString: $0.id) })

        // Step 1: Apply remote changes
        for remote in remoteTodos {
            guard let remoteId = UUID(uuidString: remote.id) else { continue }

            // Try to find existing local todo
            let descriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.id == remoteId }
            )
            let existing = try modelContext.fetch(descriptor).first

            if let local = existing {
                // Skip items that are locally soft-deleted and pending sync.
                // The local delete intent should be preserved until the server
                // processes it (which it already has in this sync cycle).
                if local.isDeleted && !local.isSynced {
                    continue
                }

                // Conflict: compare updatedAt, last write wins
                if remote.updatedAt > local.updatedAt {
                    local.title = remote.title
                    local.parentId = remote.parentId.flatMap { UUID(uuidString: $0) }
                    if let remoteListId = remote.listId, remoteListId.lowercased() != local.listKey?.lowercased() {
                        local.listKey = remoteListId.lowercased()
                        local.listEnteredAt = Date()
                    }
                    local.itemNotes = remote.notes
                    local.isCompleted = remote.completed
                    local.completedAt = remote.completedAt
                    local.position = remote.position ?? local.position
                    local.dueDate = remote.dueDate
                    local.recurrence = remote.recurrence
                    // sticky is user-toggled, so it follows the same
                    // last-write-wins resolution as the other user-editable
                    // fields here.
                    local.sticky = remote.sticky ?? false
                    local.updatedAt = remote.updatedAt
                    local.isSynced = true
                }
                // If local is newer, it will be synced on next sync
            } else {
                // New remote item - create locally
                let todo = TodoItem(title: remote.title, userId: userId, position: remote.position ?? "a0")
                todo.id = remoteId
                todo.parentId = remote.parentId.flatMap { UUID(uuidString: $0) }
                todo.listKey = remote.listId?.lowercased()
                todo.listEnteredAt = Date()
                todo.itemNotes = remote.notes
                todo.isCompleted = remote.completed
                todo.completedAt = remote.completedAt
                todo.dueDate = remote.dueDate
                todo.recurrence = remote.recurrence
                todo.sticky = remote.sticky ?? false
                todo.createdAt = remote.createdAt
                todo.updatedAt = remote.updatedAt
                todo.isSynced = true
                todo.isDeleted = false
                modelContext.insert(todo)
            }
        }

        // Step 2: Mark all local changes as synced and clear pending URLs
        for changeId in localChangeIds {
            guard let uuid = UUID(uuidString: changeId) else { continue }
            let descriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.id == uuid }
            )
            if let todo = try modelContext.fetch(descriptor).first {
                todo.isSynced = true
                todo.pendingUrls = []
            }
        }

        // Step 3: Remove local synced items that no longer exist on the server
        // (deleted via web or another client)
        let localDescriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && $0.isSynced && !$0.isDeleted }
        )
        let localSyncedTodos = try modelContext.fetch(localDescriptor)

        for local in localSyncedTodos {
            if !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }
        }

        // Step 4: Clean up soft-deleted items that have been synced
        let deleteDescriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && $0.isDeleted && $0.isSynced }
        )
        let toDelete = try modelContext.fetch(deleteDescriptor)

        for todo in toDelete {
            modelContext.delete(todo)
        }

        // Step 5: Sync URLs (server is authoritative — upsert to avoid momentary disappearance)
        for remote in remoteTodos {
            guard let remoteId = UUID(uuidString: remote.id) else { continue }

            let itemDescriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.id == remoteId }
            )
            guard let todo = try modelContext.fetch(itemDescriptor).first else { continue }

            let remoteUrls = remote.urls ?? []
            let remoteUrlIds = Set(remoteUrls.map { $0.id })
            let existingById = todo.urls.reduce(into: [:]) { dict, url in dict[url.id] = url }

            // Delete URLs no longer present on the server
            for url in todo.urls where !remoteUrlIds.contains(url.id) {
                modelContext.delete(url)
            }

            // Update existing URLs in place, insert new ones
            var updatedUrls: [TodoUrl] = []
            for remoteUrl in remoteUrls {
                if let existing = existingById[remoteUrl.id] {
                    existing.title = remoteUrl.title
                    existing.itemDescription = remoteUrl.description
                    existing.siteName = remoteUrl.siteName
                    existing.favicon = remoteUrl.favicon
                    existing.fetchStatus = remoteUrl.fetchStatus.rawValue
                    existing.fetchedAt = remoteUrl.fetchedAt
                    existing.updatedAt = remoteUrl.updatedAt
                    updatedUrls.append(existing)
                } else {
                    let newUrl = TodoUrl(from: remoteUrl)
                    modelContext.insert(newUrl)
                    updatedUrls.append(newUrl)
                }
            }
            todo.urls = updatedUrls
        }

        // Single save for the entire operation
        try modelContext.save()
    }

    /// Reset sync state (used on sign out)
    func reset() {
        webSocketService?.disconnect()
        lastSyncedAt = nil
        state = .idle
        UserDefaults.standard.removeObject(forKey: lastSyncedAtKey)
    }
}

