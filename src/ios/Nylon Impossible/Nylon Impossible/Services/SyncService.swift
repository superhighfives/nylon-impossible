//
//  SyncService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation
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
    private var modelContext: ModelContext?
    
    /// Expose API service for direct API calls (e.g. fetching URLs)
    var apiService: APIService? {
        _apiService as? APIService
    }

    private(set) var state: SyncState = .idle
    private(set) var lastSyncedAt: Date?
    
    /// URLs keyed by todo ID, populated from sync response
    private(set) var urlsByTodoId: [String: [APITodoUrl]] = [:]
    
    /// Get URLs for a specific todo
    func urls(for todoId: UUID) -> [APITodoUrl] {
        urlsByTodoId[todoId.uuidString.lowercased()] ?? []
    }

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

    /// Create todos via the smart create API endpoint, then sync results into SwiftData.
    /// Falls back to local creation if not signed in.
    func smartCreate(text: String, context: ModelContext, userId: String?, allTodos: [TodoItem]) async {
        // Offline fallback: create locally
        guard authService.isSignedIn, userId != nil, let apiService = _apiService else {
            // Create a single local todo
            let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedText.isEmpty else { return }
            let lastPosition = allTodos
                .filter { !$0.isDeleted && !$0.isCompleted }
                .map { $0.position }
                .sorted()
                .last
            let position = generateKeyBetween(lastPosition, nil)
            let todo = TodoItem(title: trimmedText, userId: userId, position: position)
            context.insert(todo)
            return
        }

        do {
            let _ = try await apiService.smartCreate(text: text)
            // Sync to pull the created todos into SwiftData
            await sync()
            webSocketService?.notifyChanged()
        } catch {
            print("[SmartCreate] Error: \(error), falling back to local creation")
            // Fallback: create single local todo
            let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedText.isEmpty else { return }
            let lastPosition = allTodos
                .filter { !$0.isDeleted && !$0.isCompleted }
                .map { $0.position }
                .sorted()
                .last
            let position = generateKeyBetween(lastPosition, nil)
            let todo = TodoItem(title: trimmedText, userId: userId, position: position)
            context.insert(todo)
            syncAfterAction()
        }
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
            
            // 4. Extract URLs from response and store in memory
            var newUrlsByTodoId: [String: [APITodoUrl]] = [:]
            for todo in response.todos {
                if let urls = todo.urls, !urls.isEmpty {
                    newUrlsByTodoId[todo.id.lowercased()] = urls
                }
            }
            urlsByTodoId = newUrlsByTodoId

            // 5. Update sync timestamp
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
            print("[Sync] Error: \(error)")
            state = .error(error.localizedDescription)
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
            TodoChange(
                // Normalize UUID to lowercase to match web-generated IDs in D1
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
                    local.itemDescription = remote.description
                    local.isCompleted = remote.completed
                    local.position = remote.position ?? local.position
                    local.dueDate = remote.dueDate
                    local.priority = remote.priority
                    local.updatedAt = remote.updatedAt
                    local.isSynced = true
                }
                // If local is newer, it will be synced on next sync
            } else {
                // New remote item - create locally
                let todo = TodoItem(title: remote.title, userId: userId, position: remote.position ?? "a0")
                todo.id = remoteId
                todo.itemDescription = remote.description
                todo.isCompleted = remote.completed
                todo.dueDate = remote.dueDate
                todo.priority = remote.priority
                todo.createdAt = remote.createdAt
                todo.updatedAt = remote.updatedAt
                todo.isSynced = true
                todo.isDeleted = false
                modelContext.insert(todo)
            }
        }

        // Step 2: Mark all local changes as synced
        for changeId in localChangeIds {
            guard let uuid = UUID(uuidString: changeId) else { continue }
            let descriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.id == uuid }
            )
            if let todo = try modelContext.fetch(descriptor).first {
                todo.isSynced = true
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
