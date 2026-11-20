//
//  SyncService+Changes.swift
//  Nylon Impossible
//
//  Gathering local changes for the sync request. Split from SyncService.swift
//  to keep its type body under SwiftLint's length limit; like
//  SyncService+Lists.swift it has no state of its own.
//

import Foundation
import SwiftData

extension SyncService {
    /// Every unsynced change for this user, as the sync request sends it.
    func gatherLocalChanges(userId: String) throws -> [TodoChange] {
        guard let modelContext else { return [] }

        // Fetch unsynced items for this user
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && !$0.isSynced }
        )
        let unsyncedItems = try modelContext.fetch(descriptor)

        return unsyncedItems.map { todo in
            let pendingUrlChanges = todo.isSoftDeleted || todo.pendingUrls.isEmpty
                ? nil
                : todo.pendingUrls.map { TodoUrlChange(url: $0) }
            return TodoChange(
                // Normalize UUID to lowercase to match web-generated IDs in D1
                id: todo.id.uuidString.lowercased(),
                // Immutable; honoured only on create, but harmless to resend.
                parentId: todo.isSoftDeleted ? nil : todo.parentId?.uuidString.lowercased(),
                listId: todo.isSoftDeleted ? nil : todo.listKey?.lowercased(),
                title: todo.isSoftDeleted ? nil : todo.title,
                // The editor stops at the limit, but notes saved before it
                // did could be longer, and /sync rejects the whole push for
                // one. Cut, so the rest of this device's changes still sync.
                notes: todo.isSoftDeleted ? nil : todo.itemNotes.map { TodoText.capNotes($0) },
                completed: todo.isSoftDeleted ? nil : todo.isCompleted,
                position: todo.isSoftDeleted ? nil : todo.position,
                dueDate: todo.isSoftDeleted ? nil : todo.dueDate,
                recurrence: todo.isSoftDeleted ? nil : todo.recurrence,
                completedAt: todo.isSoftDeleted ? nil : todo.completedAt,
                updatedAt: todo.updatedAt,
                deleted: todo.isSoftDeleted ? true : nil,
                pinned: todo.isSoftDeleted ? nil : todo.pinned,
                urls: pendingUrlChanges
            )
        }
        .orderedForSync()
    }
}
