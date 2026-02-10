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
        switch selectedFilter {
        case .all:
            return todos
        case .active:
            return todos.filter { !$0.isCompleted }
        case .done:
            return todos.filter { $0.isCompleted }
        }
    }
    
    func addTodo(context: ModelContext) {
        let trimmedText = newTaskText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        
        let todo = TodoItem(title: trimmedText)
        context.insert(todo)
        newTaskText = ""
    }
    
    func toggleTodo(_ todo: TodoItem) {
        todo.isCompleted.toggle()
    }
    
    func deleteTodo(_ todo: TodoItem, context: ModelContext) {
        context.delete(todo)
    }
}
