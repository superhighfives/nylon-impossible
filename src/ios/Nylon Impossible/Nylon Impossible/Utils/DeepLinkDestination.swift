//
//  DeepLinkDestination.swift
//  Nylon Impossible
//
//  Where a `DeepLink` takes the app, worked out from the lists it holds. App
//  only: the widget builds links, it never follows them.
//

import Foundation

/// Kept apart from the view so the routing is testable without one.
struct DeepLinkDestination: Equatable {
    /// The phone page to show.
    let page: TodoViewModel.Page
    /// One of your lists to open on the Lists page (phone) or as the fourth
    /// column (iPad); nil for a time list.
    let collectionId: String?
    /// The list the composer adds to — the column to focus on iPad.
    let listId: String?

    /// - Parameter lists: every list, as `ContentView.orderedLists` holds them.
    ///   A list id that isn't among them (deleted, or not synced yet) falls
    ///   back to Today rather than opening nothing.
    static func resolve(_ target: DeepLink.ListTarget, lists: [TodoListModel]) -> DeepLinkDestination {
        func system(_ kind: SystemListKind) -> String? {
            lists.first { $0.systemKind == kind }?.id
        }
        switch target {
        case .today:
            return DeepLinkDestination(page: .today, collectionId: nil, listId: system(.today))
        case .thisWeek:
            return DeepLinkDestination(page: .thisWeek, collectionId: nil, listId: system(.thisWeek))
        case .someday:
            return DeepLinkDestination(page: .someday, collectionId: nil, listId: system(.someday))
        case .list(let id):
            guard let list = lists.first(where: { $0.id.caseInsensitiveCompare(id) == .orderedSame }) else {
                return resolve(.today, lists: lists)
            }
            if let kind = list.systemKind {
                return resolve(DeepLink.ListTarget(systemKind: kind), lists: lists)
            }
            return DeepLinkDestination(page: .lists, collectionId: list.id, listId: list.id)
        }
    }
}
