//
//  TodoItem.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import Foundation
import SwiftData

/// Priority levels for todos
enum TodoPriority: String, Codable, CaseIterable {
    case high
    case low
}

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
    var title: String
    var itemNotes: String?  // Optional notes
    var isCompleted: Bool
    var createdAt: Date
    var updatedAt: Date           // For sync conflict resolution
    var isSynced: Bool            // Whether this item has been synced to server
    var isDeleted: Bool           // Soft delete for sync
    var position: String = "a0"   // Fractional index for ordering
    var dueDate: Date?            // Optional due date
    var priority: String?         // "high" or "low", stored as String for SwiftData
    var recurrenceFrequency: String?  // RecurrenceFrequency raw value; nil = non-repeating
    var aiStatus: String?         // AI processing status: pending, processing, complete, failed
    var researchId: String?           // Research record ID from server
    var researchStatus: String?       // "pending" | "completed" | "failed"
    var researchType: String?         // "general" | "location"
    var researchSummary: String?
    var researchedAt: Date?
    var researchCreatedAt: Date?      // When research was started (for stale detection)
    var pendingUrls: [String] = [] // URLs waiting to be synced to server
    @Relationship(deleteRule: .cascade) var urls: [TodoUrl] = []

    init(title: String, userId: String? = nil, position: String = "a0") {
        self.id = UUID()
        self.userId = userId
        self.title = title
        self.itemNotes = nil
        self.isCompleted = false
        self.position = position
        self.createdAt = Date()
        self.updatedAt = Date()
        self.isSynced = false
        self.isDeleted = false
        self.dueDate = nil
        self.priority = nil
        self.recurrenceFrequency = nil
        self.aiStatus = nil
        self.researchId = nil
        self.researchStatus = nil
        self.researchType = nil
        self.researchSummary = nil
        self.researchedAt = nil
        self.researchCreatedAt = nil
        self.pendingUrls = []
    }
    
    /// Mark as modified (for sync tracking)
    func markModified() {
        updatedAt = Date()
        isSynced = false
    }
    
    /// Get priority as enum
    var todoPriority: TodoPriority? {
        get {
            guard let priority = priority else { return nil }
            return TodoPriority(rawValue: priority)
        }
        set {
            priority = newValue?.rawValue
        }
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
    
    /// Check if todo is overdue
    var isOverdue: Bool {
        guard let dueDate = dueDate, !isCompleted else { return false }
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
    var isAIProcessing: Bool {
        guard todoAIStatus == .pending || todoAIStatus == .processing else { return false }
        return Date().timeIntervalSince(createdAt) < 60
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
}
