//
//  MoveMenuPlan.swift
//  Nylon Impossible
//
//  What the phone's "Move to" group offers: the other time lists with an arrow
//  that points the way they lie (Today ← This week → Someday), the two
//  collections moved to most recently, and the rest under "More". Kept apart
//  from the view so the choices can be tested.
//

import Foundation

/// The collections a todo was last moved to, newest first, per device.
struct RecentMoveLists {
    static let limit = 2
    private static let key = "recentMoveListIds"

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var ids: [String] {
        defaults.stringArray(forKey: Self.key) ?? []
    }

    func record(_ listId: String) {
        let id = listId.lowercased()
        let kept = ids.filter { $0.lowercased() != id }
        defaults.set(Array(([listId] + kept).prefix(20)), forKey: Self.key)
    }
}

struct MoveMenuPlan {
    let timeLists: [TodoListModel]
    let recent: [TodoListModel]
    let more: [TodoListModel]

    /// `others` is every list but the todo's own, in display order. Recents
    /// that are gone or are the todo's own list are skipped, and a short
    /// history is topped up from the top of the list.
    init(others: [TodoListModel], recentIds: [String]) {
        timeLists = others.filter(\.isSystem)
        let collections = others.filter { !$0.isSystem }
        var picked: [TodoListModel] = []
        for id in recentIds {
            if let list = collections.first(where: { $0.id.lowercased() == id.lowercased() }),
               !picked.contains(where: { $0.id == list.id }) {
                picked.append(list)
            }
            if picked.count == RecentMoveLists.limit { break }
        }
        for list in collections where picked.count < RecentMoveLists.limit && !picked.contains(where: { $0.id == list.id }) {
            picked.append(list)
        }
        recent = picked
        more = collections.filter { list in !picked.contains(where: { $0.id == list.id }) }
    }

    /// Left if the target comes earlier in Today → This week → Someday than
    /// the todo's own list, right otherwise (including from a collection).
    static func arrow(to target: TodoListModel, from current: TodoListModel?) -> String {
        guard let current, current.isSystem, target.systemSortIndex < current.systemSortIndex else {
            return "arrow.right"
        }
        return "arrow.left"
    }
}
