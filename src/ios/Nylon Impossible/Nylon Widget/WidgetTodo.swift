//
//  WidgetTodo.swift
//  Nylon Widget
//
//  Created by Claude on 8/27/26.
//

import Foundation

/// A todo, flattened for the timeline.
///
/// `TodoItem` is a SwiftData model: not `Sendable`, and bound to the context it
/// was fetched into. A timeline entry outlives both — WidgetKit holds it and
/// re-renders from it for hours — so the provider reads what it needs and hands
/// the views a value type.
struct WidgetTodo: Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let dueDate: Date?
    let isSticky: Bool
    let isRepeating: Bool

    /// Overdue is relative to when the entry renders, not when it was built —
    /// which is why the provider schedules an entry at each of the day's due
    /// times rather than leaving a morning render to describe the evening.
    func isOverdue(at date: Date) -> Bool {
        guard let dueDate else { return false }
        return dueDate < date
    }
}
