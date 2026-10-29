//
//  TodoViewModel.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import Foundation
import SwiftData
import SwiftUI

@Observable
final class TodoViewModel {
    /// What the composer holds.
    var newTaskText: String = ""
    /// The page in view: one of the three time lists, the Lists index, or Done.
    var page: Page = .today
    /// The collection pushed over the Lists page, if any.
    var openCollectionId: String?

    /// The five horizontal pages, in swipe order. The switcher's tabs are
    /// the first four; Done is the round check beside the avatar.
    enum Page: Hashable, CaseIterable {
        case today, thisWeek, someday, lists, done

        /// The pages with a title in the switcher.
        static let tabs: [Page] = [.today, .thisWeek, .someday, .lists]

        var title: String {
            switch self {
            case .today: return "Today"
            case .thisWeek: return "This week"
            case .someday: return "Someday"
            case .lists: return "Lists"
            case .done: return "Done"
            }
        }

        var systemKind: SystemListKind? {
            switch self {
            case .today: return .today
            case .thisWeek: return .thisWeek
            case .someday: return .someday
            case .lists, .done: return nil
            }
        }

        init?(systemKind: SystemListKind?) {
            switch systemKind {
            case .today: self = .today
            case .thisWeek: self = .thisWeek
            case .someday: self = .someday
            case nil: return nil
            }
        }
    }

    /// The list the composer and the current page target: the open
    /// collection, or the time list in view. Nil on the Lists index.
    func currentListId(in lists: [TodoListModel]) -> String? {
        if page == .lists { return openCollectionId }
        guard let kind = page.systemKind else { return nil }
        return lists.first { $0.systemKind == kind }?.id
    }

    /// Show a list: a time list pages to it, a collection opens over Lists.
    func show(listId: String, in lists: [TodoListModel]) {
        guard let list = lists.first(where: { $0.id.lowercased() == listId.lowercased() }) else { return }
        if let page = Page(systemKind: list.systemKind) {
            openCollectionId = nil
            self.page = page
        } else {
            self.page = .lists
            openCollectionId = list.id
        }
    }

    var canAddTask: Bool {
        !newTaskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Sort a set of todos the pinned-first way every list page does. When
    /// `listId` is given, also scopes to that list first — the single place
    /// list-membership filtering happens, so callers (e.g. `ContentView`'s
    /// per-page todos) don't have to re-derive it themselves. `listId` is
    /// optional so existing single-list-already-scoped callers (subtask
    /// groups, tests) keep working unchanged.
    func sortedTodos(from todos: [TodoItem], listId: String? = nil) -> [TodoItem] {
        // Filter out soft-deleted items, then scope to the given list.
        let activeTodos = todos.filter { !$0.isSoftDeleted }
        let scoped: [TodoItem]
        if let listId {
            scoped = activeTodos.filter { $0.listKey?.lowercased() == listId }
        } else {
            scoped = activeTodos
        }

        // Sort: pinned-first among incomplete (by position asc within each
        // tier), then completed (most recently completed first). "Effective"
        // completion counts a repeat completed today as done until local
        // midnight. Completing a todo clears pinned, so
        // only incomplete todos ever participate in the pinned tier.
        return scoped.sorted { a, b in
            let aDone = a.isEffectivelyCompleted
            let bDone = b.isEffectivelyCompleted
            if aDone != bDone {
                return !aDone
            }
            if !aDone {
                if a.pinned != b.pinned {
                    return a.pinned
                }
                return a.position < b.position
            }
            // Completed: most recently completed first — completedAt for repeats,
            // updatedAt for ordinary todos (which don't stamp completedAt).
            return (a.completedAt ?? a.updatedAt) > (b.completedAt ?? b.updatedAt)
        }
    }

    /// A list page's rows: its own top-level todos that aren't done, deleted
    /// or `hidden` (a delete still showing its Undo toast), pinned first, then
    /// by position. A repeat done today stays in its slot with its next date —
    /// "the row stays" — rather than sinking the way `sortedTodos` sinks
    /// effectively-completed todos.
    func pageTodos(from todos: [TodoItem], listId: String, hidden: Set<UUID> = []) -> [TodoItem] {
        let key = listId.lowercased()
        return todos
            .filter {
                $0.parentId == nil && !$0.isSoftDeleted && !$0.isCompleted
                    && !hidden.contains($0.id) && $0.listKey?.lowercased() == key
            }
            .sorted { a, b in
                if a.pinned != b.pinned { return a.pinned }
                return a.position < b.position
            }
    }

    /// Reorders a dragged todo within its incomplete siblings.
    /// - Parameter incompleteTodos: the exact position-ordered list the
    ///   `source`/`destination` indices were computed against (e.g.
    ///   `ContentView`'s `incomplete`, filtered by `isEffectivelyCompleted`).
    ///   This must not be re-derived independently here: re-filtering with a
    ///   different completion check (e.g. `isCompleted` instead of
    ///   `isEffectivelyCompleted`) than whatever produced the indices would
    ///   silently reorder the wrong todo whenever a completed-today repeat
    ///   sits among the incomplete rows. No separate `listId` parameter is
    ///   needed here: `ContentView` pages one list at a time, so
    ///   `incompleteTodos` already only ever contains that page's own list —
    ///   reordering never needs to reach across lists (that's a `listId`
    ///   change via `moveTodoToList`, not a reorder).
    func moveTodo(from source: IndexSet, to destination: Int, in incompleteTodos: [TodoItem]) {
        var incomplete = incompleteTodos

        incomplete.move(fromOffsets: source, toOffset: destination)

        // Determine the moved item's new index
        guard let sourceIndex = source.first else { return }
        let actualDestination = destination > sourceIndex ? destination - 1 : destination

        let movedItem = incomplete[actualDestination]
        let prevPosition: String? = actualDestination > 0
            ? incomplete[actualDestination - 1].position : nil
        let nextPosition: String? = actualDestination < incomplete.count - 1
            ? incomplete[actualDestination + 1].position : nil

        movedItem.position = generateKeyBetween(prevPosition, nextPosition)
        movedItem.markModified()
    }

    /// Cross-list move — the context menu, a drop on a switcher title, or the
    /// detail sheet's List chip. Appends to the end of the target list's own
    /// incomplete todos, mirroring web's cross-list drag-drop-at-end
    /// behavior (`TodoGrid.handleDragEnd`'s `insertIndex === targetOrder.length`
    /// case), since there's no drop-index equivalent from a picker.
    func moveTodoToList(_ todo: TodoItem, to listId: String, allTodos: [TodoItem]) {
        guard todo.listKey != listId else { return }
        let targetIncomplete = allTodos
            .filter {
                $0.listKey == listId && !$0.isSoftDeleted && !$0.isEffectivelyCompleted
                    && $0.parentId == nil
            }
            .sorted { $0.position < $1.position }

        todo.position = generateKeyBetween(targetIncomplete.last?.position, nil)
        todo.listKey = listId
        todo.listEnteredAt = Date()
        todo.markModified()
    }

    /// Toggle completion. The rules live in `TodoCompletionService` so the
    /// widget's toggle intent applies exactly the same ones.
    func toggleTodo(_ todo: TodoItem, allTodos: [TodoItem], lists: [TodoListModel] = []) {
        TodoCompletionService.toggle(todo, allTodos: allTodos, lists: lists)
    }

    /// Toggle pinned. Non-destructive and instantly reversible, so this is a
    /// plain flip with no confirm step — mirrors the web pin button.
    func togglePinned(_ todo: TodoItem) {
        todo.pinned.toggle()
        todo.markModified()
    }

    /// Toggle a subtask's completion. A subtask never recurs and has no
    /// children, so this is a plain flip (no repeat handling, no cascade).
    func toggleSubtask(_ subtask: TodoItem) {
        subtask.isCompleted.toggle()
        subtask.completedAt = nil
        subtask.markModified()
    }

    /// Create a subtask under `parent`.
    func addSubtask(
        title: String,
        parent: TodoItem,
        context: ModelContext,
        userId: String?,
        allTodos: [TodoItem]
    ) {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        _ = TaskCreationService.createSubtask(
            title: title,
            parent: parent,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
    }

    /// Reorder active subtasks within a parent's sibling group.
    func moveSubtask(
        from source: IndexSet,
        to destination: Int,
        parent: TodoItem,
        allTodos: [TodoItem]
    ) {
        var active = allTodos
            .filter { $0.parentId == parent.id && !$0.isSoftDeleted && !$0.isCompleted }
            .sorted { $0.position < $1.position }

        active.move(fromOffsets: source, toOffset: destination)

        guard let sourceIndex = source.first else { return }
        let actualDestination = destination > sourceIndex ? destination - 1 : destination

        let movedItem = active[actualDestination]
        let prevPosition: String? = actualDestination > 0
            ? active[actualDestination - 1].position : nil
        let nextPosition: String? = actualDestination < active.count - 1
            ? active[actualDestination + 1].position : nil

        movedItem.position = generateKeyBetween(prevPosition, nextPosition)
        movedItem.markModified()
    }

    func deleteTodo(_ todo: TodoItem, context: ModelContext) {
        let todoId = todo.id
        let childDescriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.parentId == todoId }
        )
        let children = (try? context.fetch(childDescriptor)) ?? []

        for child in children {
            deleteSingleTodo(child, context: context)
        }

        deleteSingleTodo(todo, context: context)
    }

    private func deleteSingleTodo(_ todo: TodoItem, context: ModelContext) {
        // Soft delete for sync - mark as deleted rather than removing
        if todo.userId != nil {
            todo.isSoftDeleted = true
            todo.markModified()
        } else {
            // Local-only todo, can hard delete
            context.delete(todo)
        }
    }

    // MARK: - Lists

    /// Create a custom list on the server, then insert it locally so it's
    /// available immediately without waiting for the next full sync. Lists
    /// have no local-only/offline-optimistic path today (unlike todos) — the
    /// server is the id/position source of truth, so this awaits the API
    /// call rather than inserting speculatively.
    @MainActor
    func createList(
        name: String,
        apiService: any APIProviding,
        context: ModelContext,
        existingLists: [TodoListModel]
    ) async throws -> TodoListModel {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let lastPosition = existingLists
            .filter { $0.kind == "custom" }
            .max { $0.position < $1.position }?.position
        let api = try await apiService.createList(
            name: trimmed, position: generateKeyBetween(lastPosition, nil)
        )
        let list = TodoListModel(from: api)
        context.insert(list)
        try? context.save()
        return list
    }

    /// Rename a custom list. System lists (Today/This week/Someday) can't be
    /// renamed — callers should only offer this for `list.kind == "custom"`.
    @MainActor
    func renameList(_ list: TodoListModel, name: String, apiService: any APIProviding) async throws {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, list.kind == "custom" else { return }
        let api = try await apiService.updateList(id: list.id, name: trimmed, position: nil)
        list.name = api.name
        list.updatedAt = api.updatedAt
    }

    /// Reorder a custom list among its neighbors. System lists stay pinned to
    /// their fixed first-three position (`TodoListModel.systemSortIndex`), so
    /// this is a no-op for them.
    @MainActor
    func reorderList(
        _ list: TodoListModel,
        prev: TodoListModel?,
        next: TodoListModel?,
        apiService: any APIProviding
    ) async throws {
        guard list.kind == "custom" else { return }
        let newPosition = generateKeyBetween(prev?.position, next?.position)
        let api = try await apiService.updateList(id: list.id, name: nil, position: newPosition)
        list.position = api.position
        list.updatedAt = api.updatedAt
    }

    /// Delete a custom list. The server cascade-deletes any todos still in it
    /// (the `list_id` FK is `ON DELETE cascade`) — `deleteList`'s returned
    /// count is how many. Locally, the next full sync's snapshot diff removes
    /// those todos since the server no longer returns them, so this only
    /// needs to remove the list row itself.
    @MainActor
    func deleteList(_ list: TodoListModel, apiService: any APIProviding, context: ModelContext) async throws {
        guard list.kind == "custom" else { return }
        _ = try await apiService.deleteList(id: list.id)
        if openCollectionId == list.id {
            openCollectionId = nil
        }
        context.delete(list)
        try? context.save()
    }
}
