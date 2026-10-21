//
//  ShareCapture.swift
//  Nylon Impossible
//
//  What "Add to Nylon" from the share sheet creates. The composer's rules
//  apply: one todo per line, a date at the end of a line is its due day, and
//  text past the title limit spills into notes. A shared link rides on the
//  first todo; with nothing typed it's titled with a placeholder the server
//  replaces with the page's title once it fetches it.
//
//  Compiled into the share extension and the app (for tests and the DEBUG
//  screenshot route).
//

import Foundation
import SwiftData

enum ShareCapture {
    struct Entry: Equatable {
        let title: String
        let notes: String?
        /// The shared link, on the first entry only.
        let url: String?
        /// Whether `title` is ours (the link's placeholder or the sharing
        /// app's page title) rather than typed — never date-parsed, since its
        /// end isn't the end of anything the user said.
        let isPlaceholder: Bool
    }

    /// The domain a shared link shows as until its page is fetched:
    /// "visitlisboa.com". Nil for something that isn't a web link.
    static func displayDomain(for url: String) -> String? {
        LinkLabel.domain(url)
    }

    /// The title saved for a shared link when nothing is typed: the sharing
    /// app's own title (Safari and most readers supply the page title), or
    /// else "Check {domain}" — the placeholder the API's `isPlaceholderTitle`
    /// recognises and swaps for the fetched page title. A bare domain would
    /// read better but the server would treat it as typed and keep it.
    static func fallbackTitle(url: String, suppliedTitle: String?) -> String {
        let supplied = suppliedTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let supplied, !supplied.isEmpty { return supplied }
        return TaskCreationService.titleFromURL(url)
    }

    /// The todos a share will create, in order.
    static func entries(text: String, sharedURL: String?, fallbackTitle: String?) -> [Entry] {
        let lines = TodoText.entries(fromDraft: text)
        guard !lines.isEmpty else {
            guard let sharedURL else { return [] }
            let title = fallbackTitle ?? TaskCreationService.titleFromURL(sharedURL)
            return [Entry(title: title, notes: nil, url: sharedURL, isPlaceholder: true)]
        }
        return lines.enumerated().map { index, line in
            // The link goes on the first todo, unless it was pasted into the
            // text too — then the composer's URL extraction already has it.
            let url = index == 0 && sharedURL.map { !line.title.contains($0) } == true ? sharedURL : nil
            return Entry(title: line.title, notes: line.notes, url: url, isPlaceholder: false)
        }
    }

    /// Create the todos, top first, in `listId` (nil: Today, server-side).
    @MainActor
    @discardableResult
    static func save(
        text: String,
        sharedURL: String?,
        fallbackTitle: String?,
        listId: String?,
        parseDates: Bool,
        userId: String?,
        context: ModelContext
    ) -> [TodoItem] {
        var created: [TodoItem] = []
        // Each create lands above the list's first todo, so creating from the
        // last line up leaves them in the order they were typed.
        for entry in entries(text: text, sharedURL: sharedURL, fallbackTitle: fallbackTitle).reversed() {
            let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
            let todo: TodoItem?
            if let url = entry.url {
                todo = TaskCreationService.createTaskWithURL(
                    title: entry.title,
                    url: url,
                    userId: userId,
                    context: context,
                    allTodos: allTodos,
                    listId: listId,
                    parseDate: parseDates && !entry.isPlaceholder
                )
            } else {
                todo = TaskCreationService.createSmart(
                    text: entry.title,
                    userId: userId,
                    context: context,
                    allTodos: allTodos,
                    listId: listId,
                    parseDate: parseDates
                )
            }
            guard let todo else { continue }
            if let notes = entry.notes { todo.itemNotes = notes }
            created.insert(todo, at: 0)
        }
        do {
            try context.save()
        } catch {
            print("[ShareCapture] Failed to save: \(error)")
        }
        return created
    }
}
