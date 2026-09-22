//
//  TodoItem.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import Foundation
import SwiftData

/// Recurrence frequency for a repeating todo. Anchored on the todo's `dueDate`.
enum RecurrenceFrequency: String, Codable, CaseIterable {
    case daily
    case weekly
    case monthly
    case yearly
}

/// Recurrence rule attached to a todo. Wire format matches the server's JSON
/// shape so it can be sent/received without translation.
struct Recurrence: Codable, Sendable, Equatable {
    var frequency: RecurrenceFrequency
}

@Model
final class TodoItem {
    var id: UUID
    var userId: String?           // Clerk user ID (nil for local-only todos)
    // Parent todo id for subtasks; nil for top-level todos. One level only (a
    // subtask can't have subtasks) and immutable after creation. Stored as a
    // plain id rather than a SwiftData relationship — grouping and cascade are
    // handled explicitly, which avoids self-referential relationship pitfalls
    // and keeps the wire mapping trivial.
    var parentId: UUID?
    // Which list (Today/This Week/Sometime, or a custom list) this todo
    // belongs to. Stored as a plain id (not a SwiftData relationship) for the
    // same reasons as `parentId` — explicit grouping, trivial wire mapping.
    // Optional only for migration safety on existing local stores predating
    // this field; every todo the server returns carries one.
    //
    // An opaque server id String, not a UUID: the server's migrated system-list
    // ids are dashless 32-hex (`fb56f07a...`, see API migration 0024) which
    // `UUID(uuidString:)` rejects — a UUID type silently dropped them to nil and
    // left every list empty. A String holds any id shape the server sends.
    //
    // Deliberately NOT called `listId` — don't "tidy" it back. Two incompatible
    // `listId` columns exist in stores out in the wild: UUID (pre-#307) and
    // String (build 155, from #307's rename-and-re-add). A model attribute named
    // `listId` has to pick one type, and lightweight migration can't infer the
    // same-name type change for whichever store disagrees — that's the
    // `SwiftDataError.loadIssueModelContainer` in NYLON-IMPOSSIBLE-IOS-8. Under a
    // fresh name, both stores migrate by the two operations SwiftData always
    // infers: drop the old columns, add an optional new one.
    var listKey: String?
    // When `listKey` last changed (creation, manual move, or the server's
    // aging sweep) — mirrors the server's `listEnteredAt` column.
    var listEnteredAt: Date?
    var title: String
    var itemNotes: String?  // Optional notes
    var isCompleted: Bool
    // When a repeating todo is "completed" its dueDate rolls forward instead of
    // persisting as done; this stamps when it was checked so it stays in the
    // Completed section until local midnight, then derives back to active. Nil
    // for todos never completed as a repeat.
    var completedAt: Date?
    var createdAt: Date
    var updatedAt: Date           // For sync conflict resolution
    var isSynced: Bool            // Whether this item has been synced to server
    var isDeleted: Bool           // Soft delete for sync
    var position: String = "a0"   // Fractional index for ordering
    var dueDate: Date?            // Optional due date
    var recurrenceFrequency: String?  // RecurrenceFrequency raw value; nil = non-repeating
    // Sticky todos render above non-sticky ones and are reordered within their
    // own tier only. Clears to false when the todo is completed. Subtasks
    // never get this — no row toggle, no edit-sheet option.
    var sticky: Bool = false
    var pendingUrls: [String] = [] // URLs waiting to be synced to server
    @Relationship(deleteRule: .cascade) var urls: [TodoUrl] = []

    init(title: String, userId: String? = nil, position: String = "a0") {
        self.id = UUID()
        self.userId = userId
        self.parentId = nil
        self.listKey = nil
        self.listEnteredAt = nil
        self.title = title
        self.itemNotes = nil
        self.isCompleted = false
        self.completedAt = nil
        self.position = position
        self.createdAt = Date()
        self.updatedAt = Date()
        self.isSynced = false
        self.isDeleted = false
        self.dueDate = nil
        self.recurrenceFrequency = nil
        self.sticky = false
        self.pendingUrls = []
    }
    
    /// Mark as modified (for sync tracking)
    func markModified() {
        updatedAt = Date()
        isSynced = false
    }
    
    /// Recurrence rule as a typed value. Mirrors the server's JSON shape.
    var recurrence: Recurrence? {
        get {
            guard let raw = recurrenceFrequency,
                  let freq = RecurrenceFrequency(rawValue: raw) else { return nil }
            return Recurrence(frequency: freq)
        }
        set {
            recurrenceFrequency = newValue?.frequency.rawValue
        }
    }
    
    /// A repeat completed today reads as done until the user's local midnight,
    /// even though `isCompleted` stays false (its dueDate rolled forward). Uses
    /// the device's local calendar so it flips at the user's midnight.
    var isEffectivelyCompleted: Bool {
        if isCompleted { return true }
        guard let completedAt else { return false }
        return Calendar.current.isDateInToday(completedAt)
    }

    /// Check if todo is overdue
    var isOverdue: Bool {
        guard let dueDate = dueDate, !isEffectivelyCompleted else { return false }
        return dueDate < Date()
    }
    
}
