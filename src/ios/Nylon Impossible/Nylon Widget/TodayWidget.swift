//
//  TodayWidget.swift
//  Nylon Widget
//
//  Created by Claude on 8/27/26.
//

import SwiftData
import SwiftUI
import WidgetKit

struct TodayProvider: TimelineProvider {
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
            // "due before midnight" starts meaning a different set of todos
            // and when the meta line's "Tomorrow" becomes "Today" or a due day
            // tips into overdue. The overnight sweep that ages todos out of the
            // Today list is the server's, so it lands here with a sync rather
            // than on this schedule — and that, like every other way the list
            // changes (an edit in the app, a tap on a checkbox), ends in a
            // `WidgetRefresh.reload()`, so there's nothing to poll for between.
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
        let forToday = TodayDigest.fetch(userId: userId, context: context, now: now)
        return TodayEntry.make(from: forToday, now: now)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetRefresh.todayKind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(Theme.Colors.canvas, for: .widget)
        }
        .configurationDisplayName("Today")
        .description("Everything on your Today list, plus anything due or overdue. Tap + for a new todo.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Previews

#Preview("Small", as: .systemSmall) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, content: .todos(WidgetTodo.placeholders, total: 5))
    TodayEntry(date: .now, content: .todos([], total: 0))
    TodayEntry(date: .now, content: .signedOut)
}

#Preview("Medium", as: .systemMedium) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, content: .todos(WidgetTodo.placeholders, total: 7))
    TodayEntry(date: .now, content: .todos([], total: 0))
}

#Preview("Lock Screen", as: .accessoryRectangular) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, content: .todos(WidgetTodo.placeholders, total: 5))
}
