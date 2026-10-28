//
//  TodoListEntity.swift
//  Nylon Impossible
//
//  The list parameter Siri and Shortcuts offer for "Add todo": Today, This
//  Week, Someday, then your lists, read from the shared store.
//
//  The time lists are identified by kind ("today", "this-week", "someday" —
//  the same values `nylon://add?list=` takes), not by id. Their ids are
//  minted per account by the server, so a Shortcut saved with "This week"
//  would otherwise break on a reinstall or a fresh sign-in, and they'd be
//  missing entirely before the first sync. Your lists use their ids.
//

import AppIntents
import SwiftData

struct TodoListEntity: AppEntity, Identifiable, Hashable {
    /// `DeepLink.ListTarget.queryValue`: a kind for the time lists, an id for
    /// yours.
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "List"
    static var defaultQuery = TodoListQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }

    var target: DeepLink.ListTarget { DeepLink.ListTarget(queryValue: id) }

    static let today = TodoListEntity(id: DeepLink.ListTarget.today.queryValue, name: "Today")
    static let thisWeek = TodoListEntity(id: DeepLink.ListTarget.thisWeek.queryValue, name: "This week")
    static let someday = TodoListEntity(id: DeepLink.ListTarget.someday.queryValue, name: "Someday")

    /// Every list Siri can add to, in the app's order. The three time lists
    /// are always offered, even before the first sync has brought their rows
    /// down; a todo added then lands in Today server-side, and one meant for
    /// This week or Someday is placed once its list exists (see
    /// `AddTaskIntent.resolve`).
    static func all(from lists: [TodoListModel], userId: String?) -> [TodoListEntity] {
        let custom = lists
            .filter { !$0.isSystem && (userId == nil || $0.userId == userId) }
            .sorted { $0.position < $1.position }
            .map { TodoListEntity(id: $0.id, name: $0.name) }
        return [.today, .thisWeek, .someday] + custom
    }
}

struct TodoListQuery: EntityStringQuery {
    @MainActor
    private func allEntities() -> [TodoListEntity] {
        let context = ModelContext(SharedModelContainer.shared)
        let lists = (try? context.fetch(FetchDescriptor<TodoListModel>())) ?? []
        let userId = UserDefaults(suiteName: BackgroundSyncService.appGroupSuiteName)?
            .string(forKey: BackgroundSyncService.userIdKey)
        return TodoListEntity.all(from: lists, userId: userId)
    }

    @MainActor
    func entities(for identifiers: [String]) async throws -> [TodoListEntity] {
        let all = allEntities()
        return identifiers.compactMap { id in
            all.first { $0.id.caseInsensitiveCompare(id) == .orderedSame }
        }
    }

    @MainActor
    func entities(matching string: String) async throws -> [TodoListEntity] {
        Self.matching(string, in: allEntities())
    }

    @MainActor
    func suggestedEntities() async throws -> [TodoListEntity] {
        allEntities()
    }

    /// Lists whose name contains what was said, ignoring case and accents —
    /// "this week", "groceries" — with an exact name first.
    static func matching(_ string: String, in entities: [TodoListEntity]) -> [TodoListEntity] {
        let needle = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return entities }
        let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        let exact = entities.filter { $0.name.compare(needle, options: options) == .orderedSame }
        let partial = entities.filter { entity in
            !exact.contains(entity) && entity.name.range(of: needle, options: options) != nil
        }
        return exact + partial
    }
}
