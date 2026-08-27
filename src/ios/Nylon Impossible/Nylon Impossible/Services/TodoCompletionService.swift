//
//  TodoCompletionService.swift
//  Nylon Impossible
//
//  Completing a todo is more than flipping a flag: a repeat rolls its dueDate
//  forward and re-places itself, a completed todo unsticks, unchecking moves
//  the todo to the end of its list, and subtasks follow their parent. That
//  logic started in `TodoViewModel` and lives here so contexts without a view
//  model — the widget's toggle intent — get the same behaviour rather than a
//  second, subtly different implementation.
//

import Foundation
import SwiftData

enum TodoCompletionService {
    static func toggle(_ todo: TodoItem, allTodos: [TodoItem], lists: [TodoListModel] = []) {
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
}
