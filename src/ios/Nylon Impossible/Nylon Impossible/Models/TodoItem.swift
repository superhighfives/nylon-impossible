//
//  TodoItem.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import Foundation
import SwiftData

/// AI processing status for todos
enum TodoAIStatus: String, Codable, CaseIterable {
    case pending
    case processing
    case complete
    case failed
}

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
    var aiStatus: String?         // AI processing status: pending, processing, complete, failed
    // When enrichment actually kicked off, used to time-box the spinner. Distinct
    // from `createdAt`: enrichment is deferred (fired in SyncService once the todo
    // syncs), so for an offline-created todo it can start long after creation.
    var aiStartedAt: Date?
    var researchId: String?           // Research record ID from server
    var researchStatus: String?       // "pending" | "completed" | "failed"
    var researchType: String?         // "general" | "location"
    var researchSummary: String?
    var researchedAt: Date?
    var researchCreatedAt: Date?      // When research was started (for stale detection)
    var needsInput: Bool = false  // Agent has posted a question awaiting the user's reply
    // Sticky todos render above non-sticky ones and are reordered within their
    // own tier only. Clears to false when the todo is completed. Subtasks
    // never get this — no row toggle, no edit-sheet option.
    var sticky: Bool = false
    var pendingUrls: [String] = [] // URLs waiting to be synced to server
    // AI actions the user requested when creating the todo, but which can only
    // run once the todo exists on the server. Set locally at creation and fired
    // (then cleared) after the item syncs — so an enrich/research chosen while
    // offline still takes effect on reconnect rather than being lost.
    var pendingEnrich: Bool = false
    var pendingResearch: Bool = false
    @Relationship(deleteRule: .cascade) var urls: [TodoUrl] = []
    @Relationship(deleteRule: .cascade) var messages: [TodoMessage] = []
    @Relationship(deleteRule: .cascade) var suggestions: [TodoSuggestion] = []

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
        self.aiStatus = nil
        self.researchId = nil
        self.researchStatus = nil
        self.researchType = nil
        self.researchSummary = nil
        self.researchedAt = nil
        self.researchCreatedAt = nil
        self.needsInput = false
        self.sticky = false
        self.pendingUrls = []
        self.pendingEnrich = false
        self.pendingResearch = false
        self.aiStartedAt = nil
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
    
    /// Get AI status as enum
    var todoAIStatus: TodoAIStatus? {
        get {
            guard let aiStatus = aiStatus else { return nil }
            return TodoAIStatus(rawValue: aiStatus)
        }
        set {
            aiStatus = newValue?.rawValue
        }
    }
    
    /// Check if AI is currently processing this todo.
    /// Considered stale after 60 seconds (2x the 30s enrichment timeout)
    /// so the spinner auto-hides if the server failed to update the status.
    /// Timed from `aiStartedAt` (when enrichment was actually kicked off) rather
    /// than `createdAt`, so an enrich deferred past creation — e.g. requested
    /// offline and fired minutes later on reconnect — still shows the spinner.
    /// Falls back to `createdAt` for AI status arriving from the server (web /
    /// another device), where no local start time was stamped.
    var isAIProcessing: Bool {
        guard todoAIStatus == .pending || todoAIStatus == .processing else { return false }
        return Date().timeIntervalSince(aiStartedAt ?? createdAt) < 60
    }

    /// Check if research is currently pending
    var isResearchPending: Bool {
        researchStatus == "pending"
    }

    /// How long (in seconds) the current research record has been alive
    var researchAge: TimeInterval? {
        guard let createdAt = researchCreatedAt else { return nil }
        return Date().timeIntervalSince(createdAt)
    }

    /// True when the agent has proposed changes the user hasn't reviewed yet.
    /// Drives the yellow "needs attention" dot in the list row.
    var hasPendingSuggestions: Bool {
        suggestions.contains { $0.isPending }
    }
}
