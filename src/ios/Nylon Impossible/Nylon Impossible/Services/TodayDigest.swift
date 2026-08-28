//
//  TodayDigest.swift
//  Nylon Impossible
//
//  What the Home Screen widget means by "today", in one place: everything in
//  the user's Today list, plus anything due before local midnight wherever it
//  sits. The app icon badge counts the narrower due-or-overdue set — a badge
//  is a "this needs attention" number, not a plan for the day — but takes its
//  cutoff from here, so the two can't disagree about when the day ends.
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

    /// Top-level, still-open todos that belong to today, in the order the
    /// widget lists them: everything the user put in their **Today** list,
    /// plus anything due before local midnight whatever list it's in.
    ///
    /// The two halves are deliberately independent (see
    /// `plans/done/2026-08-06-time-bucket-lists.md`): a Today item can have no
    /// due date at all, or one three weeks out — putting it there means "I
    /// want to work on this today", not "this is due today" — and reaching a
    /// due date never promotes a todo into Today. So neither half alone
    /// answers "what am I doing today": due dates on their own miss most of
    /// what the user actually planned, and the list on its own drops the
    /// overdue thing still sitting in Sometime.
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
            // reads as "nothing for today", which is the same thing a failed
            // fetch can't distinguish itself from anyway.
            return []
        }

        // Everything else is filtered in memory: optionals in a `#Predicate`
        // are awkward (see `fetchAllTodos`), and `isEffectivelyCompleted` —
        // which keeps a repeat completed today out of the list until local
        // midnight — is a computed property a predicate can't reach at all.
        let cutoff = startOfTomorrow(after: now)
        let todayList = todayListId(userId: userId, context: context)
        let forToday = todos.filter { todo in
            guard todo.userId == userId, todo.parentId == nil else { return false }
            guard !todo.isEffectivelyCompleted else { return false }
            if let todayList, todo.listKey?.lowercased() == todayList { return true }
            guard let dueDate = todo.dueDate else { return false }
            return dueDate < cutoff
        }

        let ordered = sorted(forToday)
        guard let limit else { return ordered }
        return Array(ordered.prefix(limit))
    }

    /// The id of the user's Today list, lowercased to match the way `listKey`
    /// is compared everywhere else.
    ///
    /// Nil when there's no Today list to find — a store whose lists haven't
    /// synced yet, most likely on a fresh install where the widget can be the
    /// first thing to read it. The digest then falls back to due dates alone,
    /// which is a thin widget rather than an empty one.
    @MainActor
    private static func todayListId(userId: String, context: ModelContext) -> String? {
        let descriptor = FetchDescriptor<TodoListModel>(
            predicate: #Predicate<TodoListModel> { $0.userId == userId }
        )
        // `systemKind` is derived from a stored raw string, so the pick happens
        // in memory — a `#Predicate` can't reach a computed property.
        let lists = (try? context.fetch(descriptor)) ?? []
        return lists.first { $0.systemKind == .today }?.id.lowercased()
    }

    /// Sticky first (the app's own top tier), then soonest-due — which puts
    /// overdue items above the rest of the day without a separate rule for
    /// them, and undated Today items (`.distantFuture`) after everything with
    /// a date — then by position, so todos that sort alike keep the order they
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
