//
//  WidgetTodo.swift
//  Nylon Impossible
//
//  Created by Claude on 8/27/26.
//
//  The Today widget's timeline entry and what goes into it. Compiled into the
//  widget extension and the app — the app for tests and the DEBUG screenshot
//  route, which draws the real widget views.
//

import Foundation
import WidgetKit

/// A todo, flattened for the timeline.
///
/// `TodoItem` is a SwiftData model: not `Sendable`, and bound to the context it
/// was fetched into. A timeline entry outlives both — WidgetKit holds it and
/// re-renders from it for hours — so the provider reads what it needs and hands
/// the views a value type.
struct WidgetTodo: Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    /// The row's meta line, worked out when the entry is built. The entry is
    /// rebuilt at local midnight, which is when "Tomorrow" becomes "Today" and
    /// a due day tips into overdue.
    let meta: [MetaPart]
}

struct TodayEntry: TimelineEntry, Sendable {
    enum Content: Sendable, Equatable {
        /// Nobody is signed in, so there is nothing to show — the local store
        /// can still hold the last account's todos (signing out clears the
        /// session, not the cache), and showing those would be a small privacy
        /// leak onto the Home Screen.
        case signedOut
        case todos(_ todos: [WidgetTodo], total: Int)
    }

    let date: Date
    let content: Content

    /// The most any family renders. The provider carries this many and each
    /// family takes what fits, so a resized widget doesn't need a new
    /// timeline.
    static let maxRows = 5

    /// The entry for `todos` — already `TodayDigest`'s set, in its order.
    /// Subtasks aren't fetched for the widget, so its meta line never shows
    /// the "2/4" count; everything else matches the app's row.
    static func make(from todos: [TodoItem], now: Date = Date()) -> TodayEntry {
        let shown = todos.prefix(maxRows).map { todo in
            WidgetTodo(id: todo.id, title: todo.title, meta: TodoMeta.parts(for: todo, subtasks: [], now: now))
        }
        return TodayEntry(date: now, content: .todos(Array(shown), total: todos.count))
    }
}

/// How many rows a widget has room for. A row is a one-line title, plus a
/// meta line when it has one, so the count depends on the todos, not just
/// the family — a day of undated todos fits more than a day of deadlines.
enum TodayWidgetLayout {
    static let titleHeight: CGFloat = 20
    static let metaHeight: CGFloat = 16
    static let rowSpacing: CGFloat = 8
    /// The "+3 more" line.
    static let moreHeight: CGFloat = 16

    /// Height for rows under the header, by family (iPhone sizes; larger
    /// devices only gain room).
    static func budget(for family: WidgetFamily) -> CGFloat {
        switch family {
        case .systemSmall, .systemMedium: return 104
        case .systemLarge: return 300
        default: return 0
        }
    }

    static func height(of todo: WidgetTodo) -> CGFloat {
        titleHeight + (todo.meta.isEmpty ? 0 : metaHeight)
    }

    /// The most leading todos that fit in `budget`, leaving room for the
    /// "+N more" line whenever any are left out. Always at least one, so a
    /// long day never renders as an empty widget.
    static func fit(_ todos: [WidgetTodo], total: Int, budget: CGFloat) -> Int {
        var used: CGFloat = 0
        var count = 0
        for todo in todos {
            let next = used + (count > 0 ? rowSpacing : 0) + height(of: todo)
            let leavesSome = count + 1 < total
            let reserve = leavesSome ? rowSpacing + moreHeight : 0
            guard next + reserve <= budget else { break }
            used = next
            count += 1
        }
        return max(count, min(1, todos.count))
    }
}

extension WidgetTodo {
    /// Stand-ins for the widget gallery and Xcode previews. Never persisted,
    /// and their ids belong to no real todo — a toggle tapped in the gallery
    /// finds nothing and does nothing, which is the right outcome there.
    ///
    /// Some have no meta at all: a Today-list todo that isn't due is the
    /// ordinary case, so the gallery shouldn't promise a widget made entirely
    /// of deadlines.
    static let placeholders: [WidgetTodo] = [
        WidgetTodo(id: UUID(), title: "Renew passport", meta: [.due("2 days overdue", overdue: true)]),
        WidgetTodo(id: UUID(), title: "Review PR for the sync engine", meta: [.pinned]),
        WidgetTodo(id: UUID(), title: "Call Mum about Sunday lunch", meta: []),
        WidgetTodo(id: UUID(), title: "Water the plants", meta: [.due("Today", overdue: false), .repeats("Weekly")]),
        WidgetTodo(id: UUID(), title: "Reply to the venue about Thursday", meta: [])
    ]
}
