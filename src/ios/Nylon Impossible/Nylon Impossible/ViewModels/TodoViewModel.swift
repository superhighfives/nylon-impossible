//
//  TodoViewModel.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import Foundation
import SwiftData

enum TodoFilter: String, CaseIterable {
    case all = "All"
    case active = "Active"
    case done = "Done"
}

@Observable
final class TodoViewModel {
    var newTaskText: String = ""
    var selectedFilter: TodoFilter = .all
    
    var canAddTask: Bool {
        !newTaskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    func filteredTodos(from todos: [TodoItem]) -> [TodoItem] {
        // Filter out soft-deleted items
        let activeTodos = todos.filter { !$0.isDeleted }

        let filtered: [TodoItem]
        switch selectedFilter {
        case .all:
            filtered = activeTodos
        case .active:
            filtered = activeTodos.filter { !$0.isCompleted }
        case .done:
            filtered = activeTodos.filter { $0.isCompleted }
        }

        // Sort: incomplete first (by createdAt desc), then completed (most recently completed first)
        return filtered.sorted { a, b in
            if a.isCompleted != b.isCompleted {
                return !a.isCompleted
            }
            if a.isCompleted {
                return a.updatedAt > b.updatedAt
            }
            return a.createdAt > b.createdAt
        }
    }
    
    func addTodo(context: ModelContext, userId: String?) {
        let trimmedText = newTaskText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        
        let todo = TodoItem(title: trimmedText, userId: userId)
        context.insert(todo)
        newTaskText = ""
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
