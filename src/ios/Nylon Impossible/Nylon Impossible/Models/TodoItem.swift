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
    case high = "high"
    case low = "low"
}

@Model
final class TodoItem {
    var id: UUID
    var userId: String?           // Clerk user ID (nil for local-only todos)
    var title: String
    var itemDescription: String?  // Optional description
    var isCompleted: Bool
    var createdAt: Date
    var updatedAt: Date           // For sync conflict resolution
    var isSynced: Bool            // Whether this item has been synced to server
    var isDeleted: Bool           // Soft delete for sync
    var position: String = "a0"   // Fractional index for ordering
    var dueDate: Date?            // Optional due date
    var priority: String?         // "high" or "low", stored as String for SwiftData

    init(title: String, userId: String? = nil, position: String = "a0") {
        self.id = UUID()
        self.userId = userId
        self.title = title
        self.itemDescription = nil
        self.isCompleted = false
        self.position = position
        self.createdAt = Date()
        self.updatedAt = Date()
        self.isSynced = false
        self.isDeleted = false
        self.dueDate = nil
        self.priority = nil
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
    
    /// Check if todo is overdue
    var isOverdue: Bool {
        guard let dueDate = dueDate, !isCompleted else { return false }
        return dueDate < Date()
    }
}
