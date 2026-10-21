//
//  ScreenRoute.swift
//  Nylon Impossible
//
//  A DEBUG-only way to open the app straight into a state, for automated
//  screenshots — nothing can tap the simulator from a script.
//
//    xcrun simctl launch <udid> com.superhighfives.Nylon-Impossible \
//      -NylonScreen detail -NylonDark YES
//
//  Screens: today, week, someday, lists, collection, detail, composer, done,
//  settings, overnight (Today with the overnight note), link (no state of
//  its own; pair it with `-NylonOpenURL nylon://add?list=this-week` to follow
//  a deep link the way a tapped widget or control would. share and
//  sharetext draw the share extension's sheet (a link, and three pasted
//  lines) in the app, and widgets draws the Today widget's real views at
//  iPhone sizes, small, medium and Lock Screen, from the sample data — simctl's openurl
//  stops at a system "Open in Nylon?" prompt a script can't answer). On iPad: board,
//  column (a list open as the fourth column), inspector (the detail panel),
//  menu (a row selected, ready for a long-press). `-NylonLandscape YES`
//  draws an iPad run at landscape size; see `drawsLandscape`. The route skips sign-in and runs on in-memory sample data, so
//  it never touches the real store or the network.
//
//  States for the quality pass, on either layout: signin (the signed-out
//  screen), loading (no lists yet: "Getting your lists…"), empty (nothing in
//  Today, two waiting in This Week), syncerror (Today, or the board, under
//  the sync error line), and perf (500 todos in Today, for scrolling and the
//  done hold).
//

import ClerkKit
import SwiftData
import SwiftUI

enum ScreenRoute: String, CaseIterable {
    case today, week, someday, lists, collection, detail, composer, done, settings, overnight, link
    case share, sharetext, widgets
    case board, column, inspector, menu
    case signin, loading, empty, syncerror, perf

    /// The route from `-NylonScreen <name>`, in DEBUG builds only.
    static var launch: ScreenRoute? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "NylonScreen").flatMap(ScreenRoute.init(rawValue:))
        #else
        nil
        #endif
    }

    /// `-NylonLandscape YES` draws the app at landscape size, turned a
    /// quarter, for an iPad screenshot. A windowed iPadOS 26 scene refuses
    /// programmatic rotation and simctl can't turn the device, so the capture
    /// script rotates the PNG back. Screenshot runs only.
    static var drawsLandscape: Bool {
        #if DEBUG
        UserDefaults.standard.bool(forKey: "NylonLandscape")
        #else
        false
        #endif
    }

    /// `-NylonOpenURL <url>`: a deep link to follow on launch, through the
    /// same `DeepLink` parsing the scene delegate uses.
    static var launchDeepLink: DeepLink? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "NylonOpenURL")
            .flatMap(URL.init(string:))
            .flatMap(DeepLink.init(url:))
        #else
        nil
        #endif
    }

    /// `-NylonDark YES` forces dark mode for the run.
    static var forcesDark: Bool {
        #if DEBUG
        UserDefaults.standard.bool(forKey: "NylonDark")
        #else
        false
        #endif
    }
}

private struct ScreenRouteKey: EnvironmentKey {
    static let defaultValue: ScreenRoute? = nil
}

extension EnvironmentValues {
    /// Set only by the DEBUG screenshot route.
    var screenRoute: ScreenRoute? {
        get { self[ScreenRouteKey.self] }
        set { self[ScreenRouteKey.self] = newValue }
    }
}

#if DEBUG
/// The signed-out shell around `ContentView` for a screenshot run.
struct ScreenRouteRoot: View {
    let route: ScreenRoute

    @State private var authService = AuthService()
    @State private var syncService: SyncService
    @State private var preferences: UserPreferencesService
    private let container: ModelContainer

    init(route: ScreenRoute) {
        self.route = route
        let auth = AuthService()
        _authService = State(initialValue: auth)
        let sync = SyncService(authService: auth)
        if route == .syncerror {
            sync.showErrorForScreenshot(
                SyncErrorMessage.text(for: APIError.serverError(503, nil, url: "https://api.nylonimpossible.com/todos/sync"))
            )
        }
        _syncService = State(initialValue: sync)
        let preferences = UserPreferencesService(apiService: APIService(authService: auth))
        preferences.timezone = TimeZone.current.identifier
        if route == .overnight {
            preferences.lastSweep = LastSweep(at: Date(), movedToThisWeek: 2, movedToSomeday: 1)
            OvernightDismissal().clear()
        }
        _preferences = State(initialValue: preferences)
        container = SampleData.container(for: route)
    }

    var body: some View {
        if ScreenRoute.drawsLandscape {
            GeometryReader { geometry in
                content
                    .frame(width: geometry.size.height, height: geometry.size.width)
                    .rotationEffect(.degrees(90))
                    .frame(width: geometry.size.width, height: geometry.size.height)
            }
            .ignoresSafeArea()
            .statusBarHidden()
        } else {
            content
        }
    }

    @ViewBuilder
    private var content: some View {
        switch route {
        case .share, .sharetext: shareSheet
        case .signin:
            SignInView()
                .environment(Clerk.shared)
                .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
        case .widgets:
            WidgetGallery(container: container)
                .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
        default: app
        }
    }

    /// The share extension's view, on the sample lists.
    private var shareSheet: some View {
        let lists = ((try? container.mainContext.fetch(FetchDescriptor<TodoListModel>())) ?? [])
            .sorted { a, b in
                if a.isSystem != b.isSystem { return a.isSystem }
                if a.isSystem && b.isSystem { return a.systemSortIndex < b.systemSortIndex }
                return a.position < b.position
            }
        return Group {
            if route == .share {
                ShareSheetView(url: "https://www.visitlisboa.com/tram-28", lists: lists, onSave: { _ in }, onCancel: {})
            } else {
                ShareSheetView(
                    text: "Parmesan\nCoffee beans\nBook the dentist friday",
                    lists: lists,
                    onSave: { _ in },
                    onCancel: {}
                )
            }
        }
        .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
    }

    private var app: some View {
        ContentView()
            .environment(authService)
            .environment(syncService)
            .environment(preferences)
            .environment(\.screenRoute, route)
            .modelContainer(container)
            .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
    }
}

/// The prototype's sample todos, dated relative to today.
enum SampleData {
    static func container(for route: ScreenRoute? = nil) -> ModelContainer {
        let schema = Schema([TodoItem.self, TodoUrl.self, TodoListModel.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        // swiftlint:disable:next force_try
        let container = try! ModelContainer(for: schema, configurations: [configuration])
        switch route {
        case .loading: break
        case .empty: seedEmptyToday(container.mainContext)
        case .perf: seedMany(container.mainContext)
        default: seed(container.mainContext)
        }
        return container
    }

    private static func lists(_ context: ModelContext) -> (today: TodoListModel, week: TodoListModel, someday: TodoListModel) {
        let user = "sample-user"
        let today = TodoListModel(id: "today", userId: user, name: "Today", kind: "system", systemKind: .today)
        let week = TodoListModel(id: "thisweek", userId: user, name: "This Week", kind: "system", systemKind: .thisWeek)
        let someday = TodoListModel(id: "someday", userId: user, name: "Someday", kind: "system", systemKind: .someday)
        [today, week, someday].forEach(context.insert)
        return (today, week, someday)
    }

    /// Today empty, two waiting in This Week: the written empty state with
    /// its link, and Someday's plain one.
    static func seedEmptyToday(_ context: ModelContext, now: Date = Date()) {
        let (_, week, _) = lists(context)
        for (index, title) in ["Send invoice to Pika", "Book dentist appointment"].enumerated() {
            let item = TodoItem(title: title, userId: "sample-user", position: "a\(index)")
            item.listKey = week.id
            item.listEnteredAt = now
            item.isSynced = true
            context.insert(item)
        }
        try? context.save()
    }

    /// 500 todos in Today with the meta line's variety (due, repeat, notes,
    /// pins), for scrolling and the done hold under load.
    static func seedMany(_ context: ModelContext, count: Int = 500, now: Date = Date()) {
        let (today, week, someday) = lists(context)
        let words = ["Review", "Call", "Book", "Plan", "Fix", "Send", "Read", "Water", "Order", "Draft"]
        let things = ["the sync engine PR", "Mum about lunch", "the dentist", "the Lisbon trip", "the bike brake",
                      "the invoice to Pika", "Piranesi", "the plants", "vinyl mailers", "the quarterly report"]
        for index in 0..<count {
            let title = "\(words[index % words.count]) \(things[(index / words.count) % things.count]) \(index + 1)"
            let item = TodoItem(title: title, userId: "sample-user", position: String(format: "a%04d", index))
            item.listKey = [today.id, today.id, today.id, week.id, someday.id][index % 5]
            item.listEnteredAt = now
            item.pinned = index < 3
            item.dueDate = index % 4 == 0 ? DueLabel.inDays(index % 9 - 2, now: now) : nil
            item.recurrence = item.dueDate != nil && index % 3 == 0 ? Recurrence(frequency: .weekly) : nil
            item.itemNotes = index % 7 == 0 ? "Notes for \(title)" : nil
            item.isSynced = true
            context.insert(item)
        }
        try? context.save()
    }

    static func seed(_ context: ModelContext, now: Date = Date()) {
        let user = "sample-user"
        let today = TodoListModel(id: "today", userId: user, name: "Today", kind: "system", systemKind: .today)
        let week = TodoListModel(id: "thisweek", userId: user, name: "This Week", kind: "system", systemKind: .thisWeek)
        let someday = TodoListModel(id: "someday", userId: user, name: "Someday", kind: "system", systemKind: .someday)
        let groceries = TodoListModel(id: "groceries", userId: user, name: "Groceries", position: "a0")
        let studio = TodoListModel(id: "studio", userId: user, name: "Studio", position: "a1")
        [today, week, someday, groceries, studio].forEach(context.insert)

        var index = 0
        @discardableResult
        func todo(
            _ title: String,
            _ list: TodoListModel,
            due: Int? = nil,
            pinned: Bool = false,
            notes: String? = nil,
            repeats: RecurrenceFrequency? = nil,
            doneDaysAgo: Int? = nil,
            link: (String, String)? = nil
        ) -> TodoItem {
            index += 1
            let item = TodoItem(title: title, userId: user, position: String(format: "a%02d", index))
            item.listKey = list.id
            item.listEnteredAt = now
            item.pinned = pinned
            item.itemNotes = notes
            item.dueDate = due.map { DueLabel.inDays($0, now: now) }
            item.recurrence = repeats.map { Recurrence(frequency: $0) }
            item.createdAt = Calendar.current.date(byAdding: .day, value: -6, to: now) ?? now
            item.isSynced = true
            if let doneDaysAgo {
                item.isCompleted = true
                item.updatedAt = Calendar.current.date(byAdding: .day, value: -doneDaysAgo, to: now) ?? now
            }
            if let link {
                let url = TodoUrl(
                    id: UUID().uuidString, url: link.0, title: link.1, itemDescription: nil,
                    siteName: nil, favicon: nil, image: nil, position: "a0",
                    fetchStatus: "fetched", fetchedAt: now, createdAt: now, updatedAt: now
                )
                context.insert(url)
                item.urls = [url]
            }
            context.insert(item)
            return item
        }

        todo("Review PR for the sync engine", today, pinned: true)
        todo("Call Mum about Sunday lunch", today, due: 0)
        todo("Finish quarterly report", today, due: 0, notes: "Q3 numbers are in the shared sheet. Draft before the 2pm call.")
        todo("Water the plants", today, due: 0, repeats: .weekly)

        todo("Send invoice to Pika", week, due: 1)
        todo("Renew passport", week, due: -4)
        let trip = todo(
            "Plan Lisbon trip", week, due: 4,
            notes: "Flights land Thursday 9:40am. Ask Rita for the pastelaria list and check whether the tram 28 pass covers Belém.",
            link: ("https://www.visitlisboa.com/tram-28", "Tram 28 — the complete guide")
        )
        todo("Book dentist appointment", week)

        todo("Repaint the hallway", someday)
        todo("Learn to make sourdough", someday, link: ("https://www.theperfectloaf.com/beginners-sourdough-bread", "Beginner sourdough bread"))
        todo("Read Piranesi", someday)
        todo("Fix the bike’s back brake", someday)

        todo("Parmesan", groceries)
        todo("Coffee beans", groceries)
        todo("Sourdough loaf", groceries)
        todo("Oat milk", groceries)
        todo("Order more vinyl mailers", studio)
        todo("Update portfolio site", studio)
        todo("Mix the new EP", studio, due: 12)

        todo("Email the landlord", today, doneDaysAgo: 0)
        todo("Pick up dry cleaning", week, doneDaysAgo: 1)
        todo("Lemons", groceries, doneDaysAgo: 1)

        for (offset, (title, done)) in [
            ("Book flights", true), ("Find an apartment in Alfama", false),
            ("Reserve dinner at Taberna", false), ("Buy a travel adapter", false)
        ].enumerated() {
            let subtask = TodoItem(title: title, userId: user, position: "a\(offset)")
            subtask.parentId = trip.id
            subtask.listKey = week.id
            subtask.isCompleted = done
            context.insert(subtask)
        }
        try? context.save()
    }
}
#endif
