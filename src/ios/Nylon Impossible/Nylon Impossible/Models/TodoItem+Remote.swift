//
//  TodoItem+Remote.swift
//  Nylon Impossible
//
//  How a server row lands in the local store. Shared by `SyncService` (the
//  app's full sync) and `WidgetServerRefresh` (the iOS widget's own pull), so
//  the two can't disagree about which fields a newer server row overwrites.
//

import Foundation

extension TodoItem {
    /// A local copy of a todo that only exists on the server so far.
    convenience init(remote: APITodo, id: UUID, userId: String) {
        self.init(title: remote.title, userId: userId, position: remote.position ?? "a0")
        self.id = id
        parentId = remote.parentId.flatMap { UUID(uuidString: $0) }
        listKey = remote.listId?.lowercased()
        listEnteredAt = Date()
        itemNotes = remote.notes
        isCompleted = remote.completed
        completedAt = remote.completedAt
        dueDate = remote.dueDate
        recurrence = remote.recurrence
        pinned = remote.isPinned
        createdAt = remote.createdAt
        updatedAt = remote.updatedAt
        isSynced = true
        isSoftDeleted = false
    }

    /// Take the server's copy of every user-editable field. Callers decide
    /// whether it should win (last write wins on `updatedAt`, and a pending
    /// local change is never overwritten); this only does the copying.
    func apply(remote: APITodo) {
        title = remote.title
        parentId = remote.parentId.flatMap { UUID(uuidString: $0) }
        if let remoteListId = remote.listId, remoteListId.lowercased() != listKey?.lowercased() {
            listKey = remoteListId.lowercased()
            listEnteredAt = Date()
        }
        itemNotes = remote.notes
        isCompleted = remote.completed
        completedAt = remote.completedAt
        position = remote.position ?? position
        dueDate = remote.dueDate
        recurrence = remote.recurrence
        // pinned is user-toggled, so it follows the same last-write-wins
        // resolution as the other user-editable fields here.
        pinned = remote.isPinned
        updatedAt = remote.updatedAt
        isSynced = true
    }
}
