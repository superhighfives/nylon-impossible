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
//  Screens: today, week, someday, lists, collection, detail, notesmax (see
//  ScreenRoute+NotesMax.swift), composer, done, settings, overnight (Today with the overnight note), link (no state of
//  its own; pair it with `-NylonOpenURL nylon://add?list=this-week` to follow
//  a deep link the way a tapped widget or control would. share and
//  sharetext draw the share extension's sheet (a link, and three pasted
//  lines) in the app, and widgets draws the Today widget's real views at
//  iPhone sizes, small, medium and Lock Screen, from the sample data — simctl's openurl
//  stops at a system "Open in Nylon?" prompt a script can't answer). The
//  route skips sign-in and runs on in-memory sample data, so it never
//  touches the real store or the network.
//
//  On a Mac the route is drawn in a window of its own, as the app has none:
//  `menubar` the menu bar popover (as an admin, so the footer shows Send
//  feedback…), `feedback` the form Send feedback… opens, with the popover's
//  snapshot attached, `settings` the Settings window's view,
//  `signin` the sign-in window's, `share` the share extension at its Mac
//  sheet size, and `widgets` the desktop sizes. Any other route draws the
//  popover there too, since the Mac has no other view of a list; `composer`
//  draws it with "Dentist friday" typed in the field.
//
//  toast and toasterror draw the toast's two looks over Today, an Undo toast
//  ("Done · Undo") and a "Couldn’t …" one: on the iPhone, and in the Mac's
//  menu bar popover, where the toast sits in the header.
//
//  States for the quality pass, on the iPhone: signin (the signed-out
//  screen), loading (no lists yet: "Getting your lists…"), empty (nothing in
//  Today, two waiting in This week), syncerror (Today under the sync error
//  line), and perf (500 todos in Today, for scrolling and the
//  done hold).
//

import ClerkKit
import SwiftData
import SwiftUI

enum ScreenRoute: String, CaseIterable {
    case today, week, someday, lists, collection, detail, composer, done, settings, overnight, link
    case notesmax
    case share, sharetext, widgets
    case signin, loading, empty, syncerror, perf
    /// The toast's yellow look and its red failure look, held on screen.
    case toast, toasterror
    /// macOS: the menu bar popover, drawn in a window.
    case menubar
    /// macOS: the feedback form, as Send feedback… opens it from the popover.
    case feedback

    /// The route from `-NylonScreen <name>`, in DEBUG builds only.
    static var launch: ScreenRoute? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "NylonScreen").flatMap(ScreenRoute.init(rawValue:))
        #else
        nil
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
    /// Kept in state, like the services: SwiftUI can recreate this view
    /// struct, and a new container would release the old one and destroy
    /// every sample todo the app is still showing (a re-render then reads
    /// a dead model and crashes).
    @State private var container: ModelContainer

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
        _container = State(initialValue: SampleData.container(for: route))
    }

    var body: some View {
        content
    }

    @ViewBuilder
    private var content: some View {
        switch route {
        case .share, .sharetext: shareSheet
        case .signin:
            Group {
                #if os(macOS)
                MacSignInView {}
                    .environment(MacServices.shared.loginItem)
                #else
                SignInView()
                #endif
            }
            .environment(Clerk.shared)
            .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
        case .widgets:
            WidgetGallery(container: container)
                .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
        #if os(macOS)
        case .settings:
            MacSettingsView()
                .environment(preferences)
                .environment(syncService)
                .environment(authService)
                .environment(MacServices.shared.settings)
                .environment(MacServices.shared.loginItem)
                .environment(\.screenRoute, route)
                .modelContainer(container)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(Color(nsColor: .windowBackgroundColor))
                .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
        default:
            // As an admin on its own route, so the shot shows every footer item.
            QuickAddView(onFeedback: route == .menubar || route == .feedback ? {} : nil)
                .environment(authService)
                .environment(syncService)
                .environment(\.screenRoute, route)
                .modelContainer(container)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(Theme.Colors.fill)
                .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
        #else
        default: app
        #endif
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
                    // copy-lint-ignore: three sample todos someone shared, not copy
                    text: "Parmesan\nCoffee beans\nBook the dentist friday",
                    lists: lists,
                    onSave: { _ in },
                    onCancel: {}
                )
            }
        }
        #if os(macOS)
        // The extension's sheet size on a Mac (`ShareViewController`).
        .frame(width: 460, height: 380)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.fill)
        #endif
        .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
    }

    #if os(iOS)
    private var app: some View {
        ContentRoot()
            .environment(authService)
            .environment(syncService)
            .environment(preferences)
            .environment(\.screenRoute, route)
            .modelContainer(container)
            .preferredColorScheme(ScreenRoute.forcesDark ? .dark : .light)
    }
    #endif
}

extension ToastCenter {
    /// The `toast` and `toasterror` routes' toast, up for the whole run so
    /// a screenshot can't miss it. A no-op on any other route.
    func showForScreenshot(_ route: ScreenRoute) {
        guard route == .toast || route == .toasterror else { return }
        duration = .seconds(3600)
        if route == .toasterror {
            showError("Couldn’t save that change")
            return
        }
        show("Done", action: {})
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
        case .notesmax: seed(container.mainContext); fillNotes(container.mainContext)
        default: seed(container.mainContext)
        }
        return container
    }

    private static func lists(_ context: ModelContext) -> (today: TodoListModel, week: TodoListModel, someday: TodoListModel) {
        let user = "sample-user"
        let today = TodoListModel(id: "today", userId: user, name: "Today", kind: "system", systemKind: .today)
        let week = TodoListModel(id: "thisweek", userId: user, name: "This week", kind: "system", systemKind: .thisWeek)
        let someday = TodoListModel(id: "someday", userId: user, name: "Someday", kind: "system", systemKind: .someday)
        [today, week, someday].forEach(context.insert)
        return (today, week, someday)
    }

    /// Today empty, two waiting in This week: the written empty state with
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
        let week = TodoListModel(id: "thisweek", userId: user, name: "This week", kind: "system", systemKind: .thisWeek)
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
            notes: "Flights land **Thursday 9:40am**. Ask Rita for the pastelaria list.\n\nBefore we go:\n- check the [tram 28 pass](https://www.visitlisboa.com/tram-28) covers Belém\n- pack the travel adapter",
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
