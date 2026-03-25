//
//  TaskCreationService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import Foundation
import SwiftData

enum TaskCreationService {
    /// Generate a short task title from a URL string.
    /// Returns "Check domain.com" for valid URLs, or the raw string as a fallback.
    static func titleFromURL(_ urlString: String) -> String {
        guard let url = URL(string: urlString), let host = url.host else {
            return urlString
        }
        let domain = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        return "Check \(domain)"
    }

    /// Create a todo item with the given title
    /// This is the core creation logic used by both the main app and Siri
    @MainActor
    static func createTask(
        title: String,
        userId: String?,
        context: ModelContext,
        allTodos: [TodoItem]
    ) -> TodoItem {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Generate position after the last todo
        let lastPosition = allTodos
            .filter { !$0.isDeleted }
            .sorted { $0.position < $1.position }
            .last?.position
        
        let position = generateKeyBetween(lastPosition, nil)
        
        let todo = TodoItem(
            title: trimmedTitle,
            userId: userId,
            position: position
        )
        
        context.insert(todo)
        
        do {
            try context.save()
        } catch {
            print("Failed to save task: \(error)")
        }
        
        return todo
    }
    
    /// Create a todo item with an associated URL
    /// URL will be synced and metadata fetched by the server
    @MainActor
    static func createTaskWithURL(
        title: String,
        url: String,
        userId: String?,
        context: ModelContext,
        allTodos: [TodoItem]
    ) -> TodoItem {
        let todo = createTask(
            title: title,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
        
        // Store URL in pendingUrls — sent explicitly in the sync payload
        // so the server can create the todoUrls record directly without parsing the description
        todo.pendingUrls = [url]
        
        return todo
    }
    
    /// Fetch all todos for the current user
    @MainActor
    static func fetchAllTodos(userId: String?, context: ModelContext) -> [TodoItem] {
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate<TodoItem> { todo in
                !todo.isDeleted
            },
            sortBy: [SortDescriptor(\.position)]
        )
        
        do {
            let todos = try context.fetch(descriptor)
            // Filter by userId in memory since predicates with optionals are tricky
            if let userId = userId {
                return todos.filter { $0.userId == userId || $0.userId == nil }
            }
            return todos.filter { $0.userId == nil }
        } catch {
            print("Failed to fetch todos: \(error)")
            return []
        }
    }
}
