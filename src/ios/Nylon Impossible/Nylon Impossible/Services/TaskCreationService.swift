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
        
        // Generate position before the first incomplete todo so the new task appears at the top
        let firstPosition = allTodos
            .filter { !$0.isDeleted && !$0.isCompleted }
            .min { $0.position < $1.position }?
            .position

        let position = generateKeyBetween(nil, firstPosition)
        
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
    
    /// Create a subtask under a parent todo. Positioned at the end of the
    /// parent's active sibling group. Recurrence and subtasks are mutually
    /// exclusive, so adding a subtask clears a recurring parent's recurrence.
    @MainActor
    static func createSubtask(
        title: String,
        parent: TodoItem,
        userId: String?,
        context: ModelContext,
        allTodos: [TodoItem]
    ) -> TodoItem {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)

        let lastPosition = allTodos
            .filter { $0.parentId == parent.id && !$0.isDeleted && !$0.isCompleted }
            .max { $0.position < $1.position }?
            .position

        let position = generateKeyBetween(lastPosition, nil)

        let todo = TodoItem(title: trimmedTitle, userId: userId, position: position)
        todo.parentId = parent.id
        context.insert(todo)

        if parent.recurrence != nil {
            parent.recurrence = nil
            parent.markModified()
        }

        do {
            try context.save()
        } catch {
            print("Failed to save subtask: \(error)")
        }

        return todo
    }

    /// Create a todo from raw add-bar text the way the server's smart-create
    /// would, but entirely locally: derive a URL-aware title and any URLs up
    /// front so the item appears and persists instantly, then let sync push it
    /// and fetch URL metadata in the background. Offline-safe by construction —
    /// no network is on the create path. Returns nil for empty input.
    @MainActor
    static func createSmart(
        text: String,
        userId: String?,
        context: ModelContext,
        allTodos: [TodoItem]
    ) -> TodoItem? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let parsed = parseSmartInput(trimmed)
        let todo = createTask(
            title: parsed.title,
            userId: userId,
            context: context,
            allTodos: allTodos
        )

        if !parsed.urls.isEmpty {
            todo.pendingUrls = parsed.urls
            do {
                try context.save()
            } catch {
                print("Failed to save smart task URLs: \(error)")
            }
        }

        return todo
    }

    /// Parse raw input into an initial title and any URLs, mirroring the
    /// server's `createInitialTodo` (smart-create.ts) so an optimistic local
    /// todo matches what the server would have produced. URL-dominant input
    /// (a URL taking up >80% of the text) becomes "Check domain.com"; otherwise
    /// the title is the truncated text with any URLs extracted alongside.
    static func parseSmartInput(_ text: String) -> (title: String, urls: [String]) {
        let matches = urlMatches(in: text)

        if let first = matches.first,
           Double(first.count) > Double(text.count) * 0.8,
           let fallback = fallbackFromURL(first) {
            return (fallback.title, [fallback.url])
        }

        return (truncateTitle(text), extractUrls(from: text))
    }

    /// Extract unique, validated http(s) URLs from text, in order of appearance.
    /// Mirrors `extractUrlsFromText` in the server's url-helpers.
    static func extractUrls(from text: String) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for match in urlMatches(in: text) {
            if let normalized = normalizedURL(match), !seen.contains(normalized) {
                seen.insert(normalized)
                result.append(normalized)
            }
        }
        return result
    }

    /// Truncate a title to `maxLength`, preferring a trailing word boundary and
    /// appending an ellipsis. Follows the server's `truncateTitle` word-boundary
    /// logic, but counts/cuts by grapheme cluster where the server counts UTF-16
    /// length and cuts by Unicode code point — so at an exact-boundary title
    /// containing a multi-scalar cluster (ZWJ/skin-tone/flag) the two can pick a
    /// slightly different cut. Chosen deliberately: graphemes never split a
    /// visible glyph. Practically moot for real titles, which sit well under 500.
    static func truncateTitle(_ title: String, maxLength: Int = 500) -> String {
        guard title.count > maxLength else { return title }

        let target = maxLength - 3
        let truncated = String(title.prefix(target))

        // If there's a space in the last 20% of the cut, break there instead.
        if let space = truncated.range(of: " ", options: .backwards) {
            let idx = truncated.distance(from: truncated.startIndex, to: space.lowerBound)
            if Double(idx) > Double(truncated.count) * 0.8 {
                return truncated[truncated.startIndex..<space.lowerBound] + "..."
            }
        }

        return truncated + "..."
    }

    // MARK: - URL parsing internals

    /// Matches the server's URL_REGEX (`https?://[^\s<>"{}|\\^`\[\]]+`).
    private static let urlDetector = try? NSRegularExpression(
        pattern: "https?://[^\\s<>\"{}|\\\\^`\\[\\]]+",
        options: [.caseInsensitive]
    )

    private static func urlMatches(in text: String) -> [String] {
        guard let regex = urlDetector else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            Range(match.range, in: text).map { String(text[$0]) }
        }
    }

    /// Strip trailing punctuation that shouldn't be part of a URL, matching the
    /// server's TRAILING_PUNCT (`[.,;:!?)]+$`).
    private static func stripTrailingPunctuation(_ s: String) -> String {
        s.replacingOccurrences(of: "[.,;:!?)]+$", with: "", options: .regularExpression)
    }

    /// Validate and normalize a raw URL match; nil unless it's http(s).
    private static func normalizedURL(_ raw: String) -> String? {
        let cleaned = stripTrailingPunctuation(raw)
        guard let url = URL(string: cleaned),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }
        return url.absoluteString
    }

    /// "Check domain.com" + normalized URL for a URL-dominant input. Mirrors the
    /// server's `createFallbackFromUrl`.
    private static func fallbackFromURL(_ raw: String) -> (title: String, url: String)? {
        guard let normalized = normalizedURL(raw),
              let host = URL(string: normalized)?.host else {
            return nil
        }
        let domain = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        return ("Check \(domain)", normalized)
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
        if !todo.pendingUrls.contains(url) {
            todo.pendingUrls += [url]
        }
        
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
