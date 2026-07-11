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

    var canAddTask: Bool {
        !newTaskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func sortedTodos(from todos: [TodoItem]) -> [TodoItem] {
        // Filter out soft-deleted items
        let activeTodos = todos.filter { !$0.isDeleted }

        // Sort: incomplete first (by position asc), then completed (most recently
        // completed first). "Effective" completion counts a repeat completed
        // today as done so it sits in Completed until local midnight.
        return activeTodos.sorted { a, b in
            let aDone = a.isEffectivelyCompleted
            let bDone = b.isEffectivelyCompleted
            if aDone != bDone {
                return !aDone
            }
            if !aDone {
                return a.position < b.position
            }
            // Completed: most recently completed first — completedAt for repeats,
            // updatedAt for ordinary todos (which don't stamp completedAt).
            return (a.completedAt ?? a.updatedAt) > (b.completedAt ?? b.updatedAt)
        }
    }

    func addTodo(context: ModelContext, userId: String?, allTodos: [TodoItem]) {
        guard !newTaskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        
        _ = TaskCreationService.createTask(
            title: newTaskText,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
        
        newTaskText = ""
    }

    func moveTodo(from source: IndexSet, to destination: Int, in todos: [TodoItem]) {
        // Only operate on incomplete todos sorted by position
        var incomplete = todos.filter { !$0.isDeleted && !$0.isCompleted }
            .sorted { $0.position < $1.position }

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

    func updateTodo(
        _ todo: TodoItem,
        title: String,
        notes: String?,
        dueDate: Date?,
        priority: TodoPriority?,
        recurrence: Recurrence?
    ) {
        todo.title = title
        todo.itemNotes = notes
        todo.dueDate = dueDate
        todo.todoPriority = priority
        todo.recurrence = recurrence
        todo.markModified()
    }

    func toggleTodo(_ todo: TodoItem, allTodos: [TodoItem]) {
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
            todo.dueDate = RecurrenceHelper.nextDueDate(
                recurrence, from: anchor, now: Date()
            )
            todo.completedAt = Date()
            todo.markModified()
            return
        }
        if todo.isCompleted {
            // Unchecking: move to end of the incomplete top-level list so it
            // doesn't snap back to its original position. Scoped to top-level
            // siblings so subtask positions don't interfere.
            let incompleteTodos = allTodos
                .filter { !$0.isDeleted && !$0.isEffectivelyCompleted && $0.parentId == nil && $0.id != todo.id }
                .sorted { $0.position < $1.position }
            todo.position = generateKeyBetween(incompleteTodos.last?.position, nil)
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
}
