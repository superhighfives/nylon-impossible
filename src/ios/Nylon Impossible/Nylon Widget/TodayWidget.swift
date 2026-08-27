//
//  TodayWidget.swift
//  Nylon Widget
//
//  Created by Claude on 8/27/26.
//

import SwiftData
import SwiftUI
import WidgetKit

struct TodayEntry: TimelineEntry, Sendable {
    enum Content: Sendable {
        /// Nobody is signed in, so there is nothing to show — the local store
        /// can still hold the last account's todos (signing out clears the
        /// session, not the cache), and showing those would be a small privacy
        /// leak onto the Home Screen.
        case signedOut
        case todos(_ todos: [WidgetTodo], total: Int)
    }

    let date: Date
    let content: Content
}

struct TodayProvider: TimelineProvider {
    /// The most any supported family renders. The provider fetches this many
    /// once and each family takes the prefix it has room for, so the timeline
    /// doesn't need rebuilding when a widget is resized.
    static let maxRows = 4

    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), content: .todos(WidgetTodo.placeholders, total: WidgetTodo.placeholders.count))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        // The gallery preview has no business reading somebody's real todos,
        // and would look empty for anyone who happens to be on top of theirs.
        guard !context.isPreview else {
            completion(placeholder(in: context))
            return
        }
        Task { @MainActor in
            completion(Self.currentEntry())
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        Task { @MainActor in
            let entry = Self.currentEntry()

            // A single entry, refetched at local midnight — which is both when
            // "due today" starts meaning a different set of todos and when a
            // date-only due date tips into overdue. Every other way the list
            // changes (an edit in the app, a sync, the toggle below) ends in a
            // `WidgetRefresh.reload()`, so there's nothing to poll for in
            // between.
            let midnight = TodayDigest.startOfTomorrow(after: entry.date)
            completion(Timeline(entries: [entry], policy: .after(midnight)))
        }
    }

    @MainActor
    private static func currentEntry(now: Date = Date()) -> TodayEntry {
        let defaults = UserDefaults(suiteName: BackgroundSyncService.appGroupSuiteName)
        guard let userId = defaults?.string(forKey: BackgroundSyncService.userIdKey) else {
            return TodayEntry(date: now, content: .signedOut)
        }

        let context = ModelContext(SharedModelContainer.shared)
        let due = TodayDigest.fetch(userId: userId, context: context, now: now)
        let shown = due.prefix(maxRows).map { todo in
            WidgetTodo(
                id: todo.id,
                title: todo.title,
                dueDate: todo.dueDate,
                isSticky: todo.sticky,
                isRepeating: todo.recurrence != nil
            )
        }

        return TodayEntry(date: now, content: .todos(Array(shown), total: due.count))
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetRefresh.todayKind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(Color.appBase, for: .widget)
        }
        .configurationDisplayName("Today")
        .description("Tasks due today, and anything overdue.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Previews

extension WidgetTodo {
    /// Stand-ins for the widget gallery and Xcode previews. Never persisted,
    /// and their ids belong to no real todo — a toggle tapped in the gallery
    /// finds nothing and does nothing, which is the right outcome there.
    static let placeholders: [WidgetTodo] = [
        WidgetTodo(
            id: UUID(),
            title: "Renew passport",
            dueDate: Date().addingTimeInterval(-3600),
            isSticky: false,
            isRepeating: false
        ),
        WidgetTodo(
            id: UUID(),
            title: "Book the rehearsal room",
            dueDate: Date().addingTimeInterval(7200),
            isSticky: true,
            isRepeating: false
        ),
        WidgetTodo(
            id: UUID(),
            title: "Water the monstera",
            dueDate: Date().addingTimeInterval(18_000),
            isSticky: false,
            isRepeating: true
        ),
        WidgetTodo(
            id: UUID(),
            title: "Reply to the venue about Thursday",
            dueDate: Date().addingTimeInterval(21_600),
            isSticky: false,
            isRepeating: false
        ),
    ]
}

#Preview("Small", as: .systemSmall) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, content: .todos(WidgetTodo.placeholders, total: 4))
    TodayEntry(date: .now, content: .todos([], total: 0))
    TodayEntry(date: .now, content: .signedOut)
}

#Preview("Medium", as: .systemMedium) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, content: .todos(WidgetTodo.placeholders, total: 7))
    TodayEntry(date: .now, content: .todos([], total: 0))
}
