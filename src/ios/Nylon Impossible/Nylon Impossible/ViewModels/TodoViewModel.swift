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

        // Sort: incomplete first (by position asc), then completed (most recently completed first)
        return activeTodos.sorted { a, b in
            if a.isCompleted != b.isCompleted {
                return !a.isCompleted
            }
            if !a.isCompleted {
                return a.position < b.position
            }
            // Completed: most recently completed first
            return a.updatedAt > b.updatedAt
        }
    }

    func addTodo(context: ModelContext, userId: String?, allTodos: [TodoItem]) {
        let trimmedText = newTaskText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        // Find the last position among incomplete todos
        let lastPosition = allTodos
            .filter { !$0.isDeleted && !$0.isCompleted }
            .map { $0.position }
            .sorted()
            .last

        let position = generateKeyBetween(lastPosition, nil)

        let todo = TodoItem(title: trimmedText, userId: userId, position: position)
        context.insert(todo)
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

    func toggleTodo(_ todo: TodoItem) {
        todo.isCompleted.toggle()
        todo.markModified()
    }

    func deleteTodo(_ todo: TodoItem, context: ModelContext) {
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
