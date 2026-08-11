//
//  TodoListModel.swift
//  Nylon Impossible
//
//  A list (Today/This Week/Sometime, or a custom list) a todo can belong to.
//  Named `TodoListModel` (not `List`/`TodoList`) to avoid clashing with
//  SwiftUI's `List` view and this app's own `TodoListView`-style naming.
//

import Foundation
import SwiftData

/// Which built-in bucket a system list represents. Mirrors the server's
/// `systemKind` enum. `nil` for custom lists.
enum SystemListKind: String, Codable, CaseIterable {
    case today
    case thisWeek
    case sometime
}

@Model
final class TodoListModel {
    var id: String
    var userId: String
    var name: String
    // "system" | "custom" — a system list can't be renamed, deleted, or
    // reordered out of its fixed first-three position.
    var kind: String
    var systemKindRaw: String?
    var position: String
    var createdAt: Date
    var updatedAt: Date
    // Whether this row has been synced to the server yet (mirrors TodoItem's
    // isSynced) — relevant for a list created offline.
    var isSynced: Bool

    init(
        id: String, userId: String, name: String, kind: String = "custom",
        systemKind: SystemListKind? = nil, position: String = "a0",
        createdAt: Date = Date(), updatedAt: Date = Date(), isSynced: Bool = false
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.kind = kind
        self.systemKindRaw = systemKind?.rawValue
        self.position = position
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isSynced = isSynced
    }

    var systemKind: SystemListKind? {
        get { systemKindRaw.flatMap(SystemListKind.init(rawValue:)) }
        set { systemKindRaw = newValue?.rawValue }
    }

    var isSystem: Bool { kind == "system" }

    /// Fixed display order: Today, This Week, Sometime, then custom lists
    /// (by `position`, handled separately since this only orders the three
    /// system kinds relative to each other).
    var systemSortIndex: Int {
        switch systemKind {
        case .today: return 0
        case .thisWeek: return 1
        case .sometime: return 2
        case nil: return Int.max
        }
    }
}

extension TodoListModel {
    convenience init(from api: APIList) {
        self.init(
            id: api.id,
            userId: api.userId,
            name: api.name,
            kind: api.kind,
            systemKind: api.systemKind.flatMap(SystemListKind.init(rawValue:)),
            position: api.position,
            createdAt: api.createdAt,
            updatedAt: api.updatedAt,
            isSynced: true
        )
    }
}
