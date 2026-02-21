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
    private let authService: AuthService
    private var apiService: APIService?
    private var modelContext: ModelContext?
    
    private(set) var state: SyncState = .idle
    private(set) var lastSyncedAt: Date?
    
    // UserDefaults key for persisting last sync time
    private let lastSyncedAtKey = "com.nylonimpossible.lastSyncedAt"
    
    init(authService: AuthService) {
        self.authService = authService
        self.apiService = APIService(authService: authService)
        
        // Load last synced time from UserDefaults
        if let timestamp = UserDefaults.standard.object(forKey: lastSyncedAtKey) as? Date {
            lastSyncedAt = timestamp
        }
    }
    
    func setModelContext(_ context: ModelContext) {
        self.modelContext = context
    }
    
    /// Perform a full sync with the server
    func sync() async {
        guard state != .syncing else { return }
        guard authService.isSignedIn, let userId = authService.userId else { return }
        guard let modelContext, let apiService else { return }
        
        state = .syncing
        
        do {
            // 1. Gather local changes (unsynced items for this user)
            let localChanges = try gatherLocalChanges(userId: userId)
            
            // 2. Send to server, get remote changes
            let response = try await apiService.sync(
                lastSyncedAt: lastSyncedAt,
                changes: localChanges
            )
            
            // 3. Apply remote changes locally
            try applyRemoteChanges(response.todos, userId: userId)
            
            // 4. Mark local items as synced
            try markAsSynced(localChanges.map { UUID(uuidString: $0.id)! })
            
            // 5. Clean up soft-deleted items that have been synced
            try cleanupDeletedItems(userId: userId)
            
            // 6. Update sync timestamp
            if let syncedAt = ISO8601DateFormatter().date(from: response.syncedAt) {
                lastSyncedAt = syncedAt
                UserDefaults.standard.set(syncedAt, forKey: lastSyncedAtKey)
            }
            
            // Log conflicts if any
            if !response.conflicts.isEmpty {
                print("Sync conflicts: \(response.conflicts.count)")
                for conflict in response.conflicts {
                    print("  - \(conflict.id): \(conflict.resolution)")
                }
            }
            
            state = .success(Date())
            
        } catch {
            print("Sync error: \(error)")
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
                id: todo.id.uuidString,
                title: todo.isDeleted ? nil : todo.title,
                completed: todo.isDeleted ? nil : todo.isCompleted,
                updatedAt: todo.updatedAt,
                deleted: todo.isDeleted ? true : nil
            )
        }
    }
    
    private func applyRemoteChanges(_ remoteTodos: [APITodo], userId: String) throws {
        guard let modelContext else { return }
        
        for remote in remoteTodos {
            guard let remoteId = UUID(uuidString: remote.id) else { continue }
            
            // Try to find existing local todo
            let descriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.id == remoteId }
            )
            let existing = try modelContext.fetch(descriptor).first
            
            if let local = existing {
                // Conflict: compare updatedAt, last write wins
                if remote.updatedAt > local.updatedAt {
                    local.title = remote.title
                    local.isCompleted = remote.completed
                    local.updatedAt = remote.updatedAt
                    local.isSynced = true
                }
                // If local is newer, it will be synced on next sync
            } else {
                // New remote item - create locally
                let todo = TodoItem(title: remote.title, userId: userId)
                todo.id = remoteId
                todo.isCompleted = remote.completed
                todo.createdAt = remote.createdAt
                todo.updatedAt = remote.updatedAt
                todo.isSynced = true
                todo.isDeleted = false
                modelContext.insert(todo)
            }
        }
        
        try modelContext.save()
    }
    
    private func markAsSynced(_ ids: [UUID]) throws {
        guard let modelContext else { return }
        
        for id in ids {
            let descriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.id == id }
            )
            if let todo = try modelContext.fetch(descriptor).first {
                todo.isSynced = true
            }
        }
        
        try modelContext.save()
    }
    
    private func cleanupDeletedItems(userId: String) throws {
        guard let modelContext else { return }
        
        // Delete items that are both soft-deleted AND synced
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && $0.isDeleted && $0.isSynced }
        )
        let toDelete = try modelContext.fetch(descriptor)
        
        for todo in toDelete {
            modelContext.delete(todo)
        }
        
        try modelContext.save()
    }
    
    /// Reset sync state (used on sign out)
    func reset() {
        lastSyncedAt = nil
        state = .idle
        UserDefaults.standard.removeObject(forKey: lastSyncedAtKey)
    }
}
