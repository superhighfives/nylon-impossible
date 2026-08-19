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
    var newTaskText: String = ""
    // The currently paged-to list's id. Owned here (not as ContentView
    // @State) so switching, defaulting, and any CRUD side effects (e.g.
    // jumping to a newly created list) live in one place. Nil until
    // `selectDefaultListIfNeeded` runs, once `lists` has loaded.
    var selectedListId: String?

    var canAddTask: Bool {
        !newTaskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Sort a set of todos the sticky-first way every list page does. When
    /// `listId` is given, also scopes to that list first — the single place
    /// list-membership filtering happens, so callers (e.g. `ContentView`'s
    /// per-page todos) don't have to re-derive it themselves. `listId` is
    /// optional so existing single-list-already-scoped callers (subtask
    /// groups, tests) keep working unchanged.
    func sortedTodos(from todos: [TodoItem], listId: String? = nil) -> [TodoItem] {
        // Filter out soft-deleted items, then scope to the given list.
        let activeTodos = todos.filter { !$0.isDeleted }
        let scoped: [TodoItem]
        if let listId {
            scoped = activeTodos.filter { $0.listKey?.lowercased() == listId }
        } else {
            scoped = activeTodos
        }

        // Sort: sticky-first among incomplete (by position asc within each
        // tier), then completed (most recently completed first). "Effective"
        // completion counts a repeat completed today as done so it sits in
        // Completed until local midnight. Completing a todo clears sticky, so
        // only incomplete todos ever participate in the sticky tier.
        return scoped.sorted { a, b in
            let aDone = a.isEffectivelyCompleted
            let bDone = b.isEffectivelyCompleted
            if aDone != bDone {
                return !aDone
            }
            if !aDone {
                if a.sticky != b.sticky {
                    return a.sticky
                }
                return a.position < b.position
            }
            // Completed: most recently completed first — completedAt for repeats,
            // updatedAt for ordinary todos (which don't stamp completedAt).
            return (a.completedAt ?? a.updatedAt) > (b.completedAt ?? b.updatedAt)
        }
    }

    func addTodo(context: ModelContext, userId: String?, allTodos: [TodoItem], listId: String? = nil) {
        guard !newTaskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        _ = TaskCreationService.createTask(
            title: newTaskText,
            userId: userId,
            context: context,
            allTodos: allTodos,
            listId: listId
        )

        newTaskText = ""
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

    func updateTodoTitle(_ todo: TodoItem, title: String) {
        todo.title = title
        todo.markModified()
    }

    /// - Parameter listId: threaded through the same way `sticky` is — nil
    ///   leaves the todo's current list untouched. In practice the edit sheet
    ///   moves a todo via its own picker (`onMoveToList`, fired immediately,
    ///   not bundled into Save) since that's the only cross-list affordance
    ///   on iOS, but this still accepts it directly so any other caller can
    ///   update everything — including list membership — in one call.
    func updateTodo(
        _ todo: TodoItem,
        title: String,
        notes: String?,
        dueDate: Date?,
        recurrence: Recurrence?,
        sticky: Bool,
        listId: String? = nil
    ) {
        todo.title = title
        todo.itemNotes = notes
        todo.dueDate = dueDate
        todo.recurrence = recurrence
        todo.sticky = sticky
        if let listId, listId != todo.listKey {
            todo.listKey = listId
            todo.listEnteredAt = Date()
        }
        todo.markModified()
    }

    /// Manual cross-list move — the only way to move a todo on iOS (no
    /// drag-and-drop grid). Appends to the end of the target list's own
    /// incomplete todos, mirroring web's cross-list drag-drop-at-end
    /// behavior (`TodoGrid.handleDragEnd`'s `insertIndex === targetOrder.length`
    /// case), since there's no drop-index equivalent from a picker.
    func moveTodoToList(_ todo: TodoItem, to listId: String, allTodos: [TodoItem]) {
        guard todo.listKey != listId else { return }
        let targetIncomplete = allTodos
            .filter {
                $0.listKey == listId && !$0.isDeleted && !$0.isEffectivelyCompleted
                    && $0.parentId == nil
            }
            .sorted { $0.position < $1.position }

        todo.position = generateKeyBetween(targetIncomplete.last?.position, nil)
        todo.listKey = listId
        todo.listEnteredAt = Date()
        todo.markModified()
    }

    func toggleTodo(_ todo: TodoItem, allTodos: [TodoItem], lists: [TodoListModel] = []) {
        // Undo a repeat that's checked via completedAt (stamped, not persistently
        // done). Always clear the stamp so it can never stay stuck as completed —
        // even if the recurrence or dueDate was since removed. When both are still
        // present, also roll dueDate back one occurrence so it returns to today's
        // occurrence rather than the next one. Must be checked before the
        // completion branch below, which an effectively-completed repeat also
        // matches. Mirrors the web undo path in TodoList.handleToggle.
        if !todo.isCompleted, todo.isEffectivelyCompleted {
            if let recurrence = todo.recurrence, let anchor = todo.dueDate {
                todo.dueDate = RecurrenceHelper.previousDueDate(recurrence, from: anchor)
            }
            todo.completedAt = nil
            todo.markModified()
            return
        }
        // Optimistic recurrence advance: completing a repeating todo rolls its
        // dueDate forward to the next future occurrence, stamps completedAt, and
        // keeps the completion flag clear, so it sits in Completed until local
        // midnight instead of flashing "done" and disappearing. Mirrors the
        // server's canonical advance in updateTodo / syncTodos.
        if !todo.isCompleted,
           let recurrence = todo.recurrence,
           let anchor = todo.dueDate {
            let now = Date()
            let nextDue = RecurrenceHelper.nextDueDate(recurrence, from: anchor, now: now)
            todo.dueDate = nextDue
            todo.completedAt = now
            // Completing a sticky todo unsticks it — matches the server-side
            // clear in updateTodo / syncTodos.
            todo.sticky = false
            // The new occurrence is placed by its due date's distance, per
            // the settled recurrence heuristic — then ages normally
            // afterward. Matches the server's canonical advance.
            let placement = RecurrenceHelper.placement(forDueDate: nextDue, now: now)
            let targetKind = SystemListKind(rawValue: placement.rawValue)
            if let placedList = lists.first(where: { $0.systemKind == targetKind }) {
                todo.listKey = placedList.id
                todo.listEnteredAt = now
            }
            todo.markModified()
            return
        }
        if todo.isCompleted {
            // Unchecking: move to end of the incomplete top-level list so it
            // doesn't snap back to its original position. Scoped to top-level
            // siblings in the *same list* — positions are only meaningfully
            // ordered within a list, so pulling in another list's siblings
            // here would land the todo at some arbitrary spot relative to its
            // own list once re-sorted (`sortedTodos` scopes by `listId`).
            let incompleteTodos = allTodos
                .filter {
                    !$0.isDeleted && !$0.isEffectivelyCompleted && $0.parentId == nil
                        && $0.id != todo.id && $0.listKey == todo.listKey
                }
                .sorted { $0.position < $1.position }
            todo.position = generateKeyBetween(incompleteTodos.last?.position, nil)
        }
        // Completing a sticky todo unsticks it — matches the server-side clear.
        if !todo.isCompleted && todo.sticky {
            todo.sticky = false
        }
        todo.isCompleted.toggle()
        todo.markModified()
        // Completion cascade: a parent is a master switch over its subtasks.
        // Checking completes them all; unchecking reopens them. A todo with
        // subtasks never recurs, so only this plain path reaches children.
        let newCompleted = todo.isCompleted
        for child in allTodos where child.parentId == todo.id && !child.isDeleted {
            if child.isCompleted != newCompleted {
                child.isCompleted = newCompleted
                child.markModified()
            }
        }
    }

    /// Toggle sticky. Non-destructive and instantly reversible, so this is a
    /// plain flip with no confirm step — mirrors the web pin button.
    func toggleSticky(_ todo: TodoItem) {
        todo.sticky.toggle()
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
            .filter { $0.parentId == parent.id && !$0.isDeleted && !$0.isCompleted }
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
            todo.isDeleted = true
            todo.markModified()
        } else {
            // Local-only todo, can hard delete
            context.delete(todo)
        }
    }

    // MARK: - Lists

    /// Default the paged-to list to Today once `lists` has loaded, mirroring
    /// web's initial view. No-op once a selection exists (including a user's
    /// own swipe away from Today) so this only ever fires the one time.
    func selectDefaultListIfNeeded(from lists: [TodoListModel]) {
        guard selectedListId == nil else { return }
        selectedListId = lists.first(where: { $0.systemKind == .today })?.id
    }

    /// Page to a specific list — e.g. jumping to a list just created below.
    func selectList(_ listId: String?) {
        selectedListId = listId
    }

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

    /// Rename a custom list. System lists (Today/This Week/Sometime) can't be
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
        if selectedListId == list.id {
            selectedListId = nil
        }
        context.delete(list)
        try? context.save()
    }
}
