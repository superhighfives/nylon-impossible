//
//  TodayDigest.swift
//  Nylon Impossible
//
//  What "due today" means, in one place. The Home Screen widget renders it and
//  the app icon badge counts it, and the two drifting apart is exactly the kind
//  of thing nobody notices until the badge says 3 and the widget shows 2.
//

import Foundation
import SwiftData

enum TodayDigest {
    /// Midnight at the start of the next calendar day in the user's local
    /// timezone. Anything due before this is "today or overdue" — matching the
    /// shared definition in plans/done/2026-03-21-repeating-todos.md.
    static func startOfTomorrow(after now: Date = Date()) -> Date {
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: now)
        return calendar.date(byAdding: .day, value: 1, to: startOfToday) ?? startOfToday
    }

    /// Top-level, still-open todos due before local midnight, in the order the
    /// widget lists them.
    ///
    /// Unlike `TaskCreationService.fetchAllTodos`, todos with no `userId` are
    /// left out rather than folded in with the signed-in user's: those are
    /// local-only items from a signed-out session, which `SyncService`
    /// re-homes on sign-in, and the widget only renders anything at all while
    /// somebody is signed in.
    @MainActor
    static func fetch(
        userId: String,
        limit: Int? = nil,
        context: ModelContext,
        now: Date = Date()
    ) -> [TodoItem] {
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate<TodoItem> { todo in
                !todo.isDeleted && !todo.isCompleted
            }
        )

        let todos: [TodoItem]
        do {
            todos = try context.fetch(descriptor)
        } catch {
            // A widget with no todos to show still renders — its empty state
            // reads as "nothing due", which is the same thing a failed fetch
            // can't distinguish itself from anyway.
            return []
        }

        // Everything else is filtered in memory: optionals in a `#Predicate`
        // are awkward (see `fetchAllTodos`), and `isEffectivelyCompleted` —
        // which keeps a repeat completed today out of the list until local
        // midnight — is a computed property a predicate can't reach at all.
        let cutoff = startOfTomorrow(after: now)
        let due = todos.filter { todo in
            guard todo.userId == userId, todo.parentId == nil else { return false }
            guard !todo.isEffectivelyCompleted, let dueDate = todo.dueDate else { return false }
            return dueDate < cutoff
        }

        let ordered = sorted(due)
        guard let limit else { return ordered }
        return Array(ordered.prefix(limit))
    }

    /// Sticky first (the app's own top tier), then soonest-due — which puts
    /// overdue items above the rest of today without a separate rule for them
    /// — then by position, so two todos due the same day keep the order they
    /// have in the app.
    static func sorted(_ todos: [TodoItem]) -> [TodoItem] {
        todos.sorted { a, b in
            if a.sticky != b.sticky { return a.sticky }
            let aDue = a.dueDate ?? .distantFuture
            let bDue = b.dueDate ?? .distantFuture
            if aDue != bDue { return aDue < bDue }
            return a.position < b.position
        }
    }
}
