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
            #if os(iOS)
            // Nothing writes the store while the app is closed, so an edit on
            // the web would otherwise wait for the app to be opened. Pull the
            // server's rows into the store first; on any failure (offline, no
            // session, the 8s deadline) the store is left alone and the entry
            // below is exactly what it would have been without this.
            if let userId = Self.signedInUserId {
                await WidgetServerRefresh.refresh(userId: userId, container: SharedModelContainer.shared)
            }
            let entry = Self.currentEntry()

            // Every half hour, so the pull above runs again, or at local
            // midnight if that's sooner — which is both when "due before
            // midnight" starts meaning a different set of todos and when the
            // meta line's "Tomorrow" becomes "Today". Every local write still
            // ends in a `WidgetRefresh.reload()` on top of this.
            let next = WidgetServerRefresh.nextReload(after: entry.date)
            #else
            let entry = Self.currentEntry()

            // The Mac widget stays on the local store: it can't mint a session
            // token (see `SharedClerk`), and the running Mac app keeps the
            // store current and reloads this on each save. So a single entry,
            // refetched at local midnight, when "due before midnight" starts
            // meaning a different set of todos.
            let next = TodayDigest.startOfTomorrow(after: entry.date)
            #endif
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private static var signedInUserId: String? {
        UserDefaults(suiteName: BackgroundSyncService.appGroupSuiteName)?
            .string(forKey: BackgroundSyncService.userIdKey)
    }

    @MainActor
    private static func currentEntry(now: Date = Date()) -> TodayEntry {
        guard let userId = signedInUserId else {
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
        .supportedFamilies(Self.families)
    }

    /// Small, medium and the Lock Screen on iOS; small, medium and large on
    /// the Mac desktop and in Notification Center (a Mac has no Lock Screen
    /// widgets).
    static var families: [WidgetFamily] {
        #if os(macOS)
        [.systemSmall, .systemMedium, .systemLarge]
        #else
        [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline]
        #endif
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

#if os(iOS)
#Preview("Lock Screen", as: .accessoryRectangular) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, content: .todos(WidgetTodo.placeholders, total: 5))
}
#else
#Preview("Large", as: .systemLarge) {
    TodayWidget()
} timeline: {
    TodayEntry(date: .now, content: .todos(WidgetTodo.placeholders, total: 9))
}
#endif
