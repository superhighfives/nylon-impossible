//
//  TodoChange.swift
//  Nylon Impossible
//
//  The `POST /todos/sync` request shape. Split out of APIService.swift so
//  BackgroundSyncService — which the Siri intent and the widget extension both
//  use to upload without the full API client — can build a payload without
//  dragging the client (and Sentry) in with it.
//

import Foundation

struct SyncRequest: Codable, Sendable {
    let lastSyncedAt: Date?
    let changes: [TodoChange]
}

struct TodoUrlChange: Codable, Sendable, Equatable {
    let url: String
}

struct TodoChange: Codable, Sendable {
    let id: String
    let parentId: String?  // Set on create for subtasks; server ignores on update
    let listId: String?    // Set on create (defaults to Today server-side) or a manual list move
    let title: String?
    let notes: String?
    let completed: Bool?
    let position: String?
    let dueDate: Date?
    let recurrence: Recurrence?
    let completedAt: Date?
    let updatedAt: Date
    let deleted: Bool?
    let sticky: Bool?
    let urls: [TodoUrlChange]?

    enum CodingKeys: String, CodingKey {
        case id, parentId, listId, title, notes, completed, position, dueDate,
             recurrence, completedAt, updatedAt, deleted, sticky, urls
    }

    // Custom encode so `completedAt` is sent explicitly — as JSON null when nil —
    // rather than omitted like the other optionals. The server distinguishes
    // "clear it" (null) from "leave alone" (absent), so undoing a completed
    // repeat (which nils completedAt locally) must reach the server as null.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(parentId, forKey: .parentId)
        try c.encodeIfPresent(listId, forKey: .listId)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(notes, forKey: .notes)
        try c.encodeIfPresent(completed, forKey: .completed)
        try c.encodeIfPresent(position, forKey: .position)
        try c.encodeIfPresent(dueDate, forKey: .dueDate)
        try c.encodeIfPresent(recurrence, forKey: .recurrence)
        // A delete carries no field updates, so only send completedAt for live
        // todos — otherwise a delete would spuriously null it.
        if deleted != true {
            try c.encode(completedAt, forKey: .completedAt)
        }
        try c.encode(updatedAt, forKey: .updatedAt)
        try c.encodeIfPresent(deleted, forKey: .deleted)
        try c.encodeIfPresent(sticky, forKey: .sticky)
        try c.encodeIfPresent(urls, forKey: .urls)
    }
}

extension Array where Element == TodoChange {
    /// Create parent todos before subtasks so self-referential parentId inserts
    /// succeed when both were created offline before the next sync.
    func orderedForSync() -> [TodoChange] {
        let parentRank: (TodoChange) -> Int = { $0.parentId == nil ? 0 : 1 }
        return enumerated()
            .sorted { lhs, rhs in
                let lhsRank = parentRank(lhs.element)
                let rhsRank = parentRank(rhs.element)
                return lhsRank == rhsRank ? lhs.offset < rhs.offset : lhsRank < rhsRank
            }
            .map(\.element)
    }
}
