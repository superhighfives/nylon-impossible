//
//  MacFeatureTests.swift
//  Nylon ImpossibleTests
//
//  The Mac's own pieces, as logic: a menu bar app with no board window, the
//  quick-add hotkey (key codes, modifiers, what Settings shows, what's
//  refused, how it's stored), the Settings and Sign in windows, the popover's
//  rows and keys, Send feedback…, the sign-in providers, and the widget's large family on the
//  desktop. The Carbon registration itself isn't exercised —
//  claiming a system-wide hotkey from a test run would steal it from whatever
//  the machine running the tests is doing.
//

#if os(macOS)
import AppKit
import Carbon.HIToolbox
import ClerkKit
import Foundation
import ServiceManagement
import SwiftData
import SwiftUI
import Testing
import WidgetKit
@testable import Nylon_Impossible

@Suite("Global hotkey")
struct GlobalHotKeyTests {
    @Test("The default is ⌃⌥Space")
    func defaultShortcut() {
        let shortcut = HotKeyShortcut.quickAddDefault
        #expect(shortcut.keyCode == UInt32(kVK_Space))
        #expect(shortcut.modifiers == [.control, .option])
        #expect(shortcut.displayString == "⌃⌥Space")
        #expect(shortcut.carbonModifiers == UInt32(controlKey | optionKey))
        #expect(shortcut.isValid)
    }

    @Test("Modifiers translate to Carbon's mask and read in menu order")
    func modifiers() {
        let shortcut = HotKeyShortcut(keyCode: UInt32(kVK_ANSI_N), modifierFlags: [.command, .shift, .option, .control])
        #expect(shortcut.modifiers == [.control, .option, .shift, .command])
        #expect(shortcut.carbonModifiers == UInt32(controlKey | optionKey | shiftKey | cmdKey))
        #expect(shortcut.displayString == "⌃⌥⇧⌘N")
        // Caps Lock and the function key aren't part of a hotkey.
        let noisy = HotKeyShortcut(keyCode: UInt32(kVK_ANSI_K), modifierFlags: [.command, .capsLock, .function])
        #expect(noisy.modifiers == [.command])
    }

    @Test("A hotkey needs ⌃, ⌥ or ⌘")
    func validity() {
        #expect(!HotKeyShortcut(keyCode: UInt32(kVK_ANSI_A), modifiers: []).isValid)
        #expect(!HotKeyShortcut(keyCode: UInt32(kVK_ANSI_A), modifiers: [.shift]).isValid)
        #expect(HotKeyShortcut(keyCode: UInt32(kVK_ANSI_A), modifiers: [.command, .shift]).isValid)
        #expect(HotKeyShortcut(keyCode: UInt32(kVK_F5), modifiers: [.option]).isValid)
    }

    @Test("Key names for menus")
    func keyNames() {
        #expect(HotKeyShortcut.keyName(UInt32(kVK_Return)) == "↩")
        #expect(HotKeyShortcut.keyName(UInt32(kVK_ANSI_7)) == "7")
        #expect(HotKeyShortcut.keyName(UInt32(kVK_F12)) == "F12")
        #expect(HotKeyShortcut.keyName(999) == "Key 999")
    }

    @Test("Settings store the hotkey and fall back to the default")
    @MainActor
    func persistence() throws {
        let suite = "nylon-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        let fresh = MacSettings(defaults: defaults)
        #expect(fresh.hotKey == .quickAddDefault)
        #expect(fresh.hotKeyEnabled)

        let custom = HotKeyShortcut(keyCode: UInt32(kVK_ANSI_N), modifiers: [.command, .option])
        fresh.hotKey = custom
        fresh.hotKeyEnabled = false
        let reloaded = MacSettings(defaults: defaults)
        #expect(reloaded.hotKey == custom)
        #expect(!reloaded.hotKeyEnabled)

        // A stored shortcut that isn't allowed any more is ignored.
        defaults.set(try JSONEncoder().encode(HotKeyShortcut(keyCode: 0, modifiers: [.shift])), forKey: MacSettings.Key.hotKey)
        #expect(MacSettings(defaults: defaults).hotKey == .quickAddDefault)
    }
}

@Suite("Menu bar app")
@MainActor
struct MenuBarAppTests {
    @Test("No Dock icon and no app menu: the app is an LSUIElement")
    func agentApp() {
        #expect(Bundle.main.object(forInfoDictionaryKey: "LSUIElement") as? Bool == true)
    }

    @Test("The only scene is Settings: no board window")
    func noBoardWindow() {
        let scenes = String(reflecting: type(of: MacScenes().body))
        #expect(scenes.contains("Settings<"))
        #expect(!scenes.contains("WindowGroup"))
        #expect(!scenes.contains("Window<"))
    }

    @Test("Settings comes to the front: the app activates before it opens")
    func settingsOpensInFront() {
        var steps: [String] = []
        MacWindowOpening.open(activate: { steps.append("activate") }) { steps.append("open") }
        #expect(steps == ["activate", "open"])
    }

    @Test("Sign in opens its window in front, and closes it when done")
    func signInWindow() throws {
        let signIn = MacSignInWindow()
        var activated = 0
        signIn.activate = { activated += 1 }
        #expect(!signIn.isVisible)

        signIn.show()
        let window = try #require(signIn.window)
        defer { window.close() }
        #expect(signIn.isVisible)
        #expect(activated == 1)
        #expect(window.title == "Sign in")
        let content = try #require(window.contentViewController)
        #expect(String(describing: type(of: content)).contains("MacSignInView"))

        // A second Sign in brings the same window back rather than another.
        signIn.show()
        #expect(signIn.window === window)
        #expect(activated == 2)

        signIn.close()
        #expect(!signIn.isVisible)
    }

    @Test("Sign in opens under the menu bar icon, and stays put while it's open")
    func signInPlacement() throws {
        let signIn = MacSignInWindow()
        signIn.activate = {}
        var placed: [NSWindow] = []
        signIn.place = { placed.append($0) }

        signIn.show()
        let window = try #require(signIn.window)
        defer { window.close() }
        #expect(placed.count == 1)
        #expect(placed.first === window)

        signIn.show()
        #expect(placed.count == 1)
    }

    @Test("Settings opens under the menu bar icon, stays put while it's open, and comes back under it")
    func settingsPlacement() async throws {
        let services = MacServices.shared
        let anchor = try #require(services.menuBar.anchor, "the test host has the menu bar icon")
        let activate = services.activate
        services.activate = {}
        MacServices.settingsWindow?.close()
        defer {
            MacServices.settingsWindow?.close()
            services.activate = activate
        }

        /// Where a window under the icon goes, kept on screen as `place` keeps
        /// it (a short display, like CI's, pushes a tall window up from the bottom).
        func expectUnderIcon(_ window: NSWindow) {
            let origin = MacWindowPlacement.origin(for: window.frame.size, under: anchor.icon, in: anchor.screen)
            // SwiftUI's layout can still trim a point off the height after `place`.
            #expect(abs(window.frame.origin.x - origin.x) <= 2)
            #expect(abs(window.frame.origin.y - origin.y) <= 2)
        }

        var window = try await Self.openSettings()
        expectUnderIcon(window)

        // Moved, then chosen again while it's open: it stays where it was put.
        window.setFrameOrigin(CGPoint(x: 100, y: 100))
        window = try await Self.openSettings()
        #expect(window.frame.origin == CGPoint(x: 100, y: 100))

        // Closed and opened again: back under the icon, not where it was left.
        window.close()
        window = try await Self.openSettings()
        expectUnderIcon(window)
    }

    /// Settings… as the popover's footer chooses it, with SwiftUI's own
    /// `openSettings`; returns the window once it's showing.
    private static func openSettings() async throws -> NSWindow {
        let host = NSWindow(contentRect: CGRect(x: 0, y: 0, width: 40, height: 40), styleMask: [.titled], backing: .buffered, defer: false)
        host.isReleasedWhenClosed = false
        let opened = SettingsOpener.opened
        host.contentView = NSHostingView(rootView: SettingsOpener())
        host.orderFront(nil)
        defer { host.close() }
        for _ in 0..<50 where SettingsOpener.opened == opened {
            try await Task.sleep(for: .milliseconds(100))
        }
        #expect(SettingsOpener.opened == opened + 1)
        // Let SwiftUI's first layout settle the window's height.
        try await Task.sleep(for: .milliseconds(300))
        let window = try #require(MacServices.settingsWindow, "Settings opened")
        #expect(window.isVisible)
        return window
    }
}

/// Calls `showSettings` with the environment's `openSettings` as it appears,
/// as the popover's Settings… does.
private struct SettingsOpener: View {
    @MainActor static var opened = 0
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Color.clear.onAppear {
            MacServices.shared.showSettings { openSettings() }
            Self.opened += 1
        }
    }
}

@Suite("Window placement")
struct MacWindowPlacementTests {
    /// A 1440-point-wide screen under a 24-point menu bar, and an icon near its right.
    private static let screen = CGRect(x: 0, y: 0, width: 1440, height: 876)
    private static let icon = CGRect(x: 1200, y: 876, width: 30, height: 24)

    @Test("The popover opens centred under the icon, 4 points below the menu bar")
    func popover() {
        let origin = MacWindowPlacement.origin(for: CGSize(width: 380, height: 320), under: Self.icon, in: Self.screen)
        #expect(origin == CGPoint(x: 1215 - 190, y: 876 - 320 - 4))
    }

    @Test("A window too wide to centre under the icon keeps 8 points in from the screen's right")
    func clampedRight() {
        let origin = MacWindowPlacement.origin(for: CGSize(width: 560, height: 588), under: Self.icon, in: Self.screen)
        #expect(origin == CGPoint(x: 1440 - 560 - 8, y: 876 - 588 - 4))
    }

    @Test("And 8 points in from the left, with the icon at the far left")
    func clampedLeft() {
        let icon = CGRect(x: 10, y: 876, width: 30, height: 24)
        let origin = MacWindowPlacement.origin(for: CGSize(width: 560, height: 588), under: icon, in: Self.screen)
        #expect(origin.x == 8)
    }

    @Test("A window taller than the room under the menu bar stays 8 points above the screen's bottom")
    func clampedBottom() {
        let origin = MacWindowPlacement.origin(for: CGSize(width: 560, height: 900), under: Self.icon, in: Self.screen)
        #expect(origin.y == 8)
    }

    @Test("On a second screen, it stays on the icon's screen")
    func secondScreen() {
        let screen = CGRect(x: 1440, y: 0, width: 1920, height: 1056)
        let icon = CGRect(x: 3300, y: 1056, width: 30, height: 24)
        let origin = MacWindowPlacement.origin(for: CGSize(width: 560, height: 588), under: icon, in: screen)
        #expect(origin == CGPoint(x: 1440 + 1920 - 560 - 8, y: 1056 - 588 - 4))
    }
}

@Suite("Menu bar popover")
@MainActor
struct QuickAddViewTests {
    private static let userId = "user_popover"

    @Test("It lists today only: no other list's todos, whichever list adds")
    func todayOnly() throws {
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let context = container.mainContext
        let now = Date()
        let today = TodoListModel(id: "today", userId: Self.userId, name: "Today", kind: "system", systemKind: .today)
        let week = TodoListModel(id: "week", userId: Self.userId, name: "This week", kind: "system", systemKind: .thisWeek)
        let groceries = TodoListModel(id: "groceries", userId: Self.userId, name: "Groceries")
        [today, week, groceries].forEach(context.insert)
        func todo(_ title: String, _ list: TodoListModel, due: Int? = nil) {
            let item = TodoItem(title: title, userId: Self.userId, position: "a0")
            item.listKey = list.id
            item.dueDate = due.map { DueLabel.inDays($0, now: now) }
            context.insert(item)
        }
        todo("Call Kaiser", today)
        todo("Send invoice", week)
        todo("Renew passport", week, due: 0)
        todo("Parmesan", groceries)
        try context.save()

        let all = try context.fetch(FetchDescriptor<TodoItem>())
        let lists = try context.fetch(FetchDescriptor<TodoListModel>())
        let rows = QuickAddView.todayRows(all, lists: lists, userId: Self.userId, now: now)
        #expect(Set(rows.map(\.title)) == ["Call Kaiser", "Renew passport"])
        // The same set the widget shows.
        let digest = TodayDigest.fetch(userId: Self.userId, context: context, now: now)
        #expect(rows.map(\.id) == digest.map(\.id))
        // A todo being deleted leaves straight away.
        let hidden = try #require(rows.first).id
        #expect(!QuickAddView.todayRows(all, lists: lists, userId: Self.userId, hidden: [hidden], now: now).contains { $0.id == hidden })
    }

    private func popoverFixture() throws -> (container: ModelContainer, actions: TodoActions, lists: [TodoListModel]) {
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let context = container.mainContext
        let lists = [
            TodoListModel(id: "today", userId: Self.userId, name: "Today", kind: "system", systemKind: .today),
            TodoListModel(id: "week", userId: Self.userId, name: "This week", kind: "system", systemKind: .thisWeek),
            TodoListModel(id: "groceries", userId: Self.userId, name: "Groceries"),
        ]
        lists.forEach(context.insert)
        let actions = TodoActions()
        actions.configure(context: context) {}
        return (container, actions, lists)
    }

    @Test("Typing shows no chips: no list chips and no \"Due Fri ×\", even for a draft that names a date")
    func noChips() {
        // The menu bar's composer, with "Dentist friday" typed.
        #expect(!Composer.showsChips(offersChips: QuickAddView.offersChips, menuBarKeys: true, isFocused: true, hasDraft: true))
        // The iPhone's still shows them, on focus or with a draft.
        #expect(Composer.showsChips(offersChips: true, menuBarKeys: false, isFocused: true, hasDraft: false))
        #expect(Composer.showsChips(offersChips: true, menuBarKeys: false, isFocused: false, hasDraft: true))
    }

    @Test("Return adds each line to Today, as typed, with no due date")
    func addsToTodayAsTyped() throws {
        let fixture = try popoverFixture()
        let created = QuickAddView.add("Dentist friday\nPay rent tomorrow", with: fixture.actions, lists: fixture.lists, userId: Self.userId)
        #expect(created.map(\.title) == ["Dentist friday", "Pay rent tomorrow"])
        #expect(created.allSatisfy { $0.listKey == "today" && $0.dueDate == nil })
    }

    @Test("A nylon://add link that names a list still adds to Today")
    func listLinkAddsToToday() throws {
        let fixture = try popoverFixture()
        let url = try #require(URL(string: "nylon://add?list=groceries"))
        let link = try #require(DeepLink(url: url))
        #expect(link == .add(list: .list("groceries")))
        // The popover takes the link only to open; the add path has no list
        // to follow, so Groceries never gets the todo.
        let created = QuickAddView.add("Parmesan", with: fixture.actions, lists: fixture.lists, userId: Self.userId)
        #expect(created.map(\.listKey) == ["today"])
    }

    @Test("↵ edits a row's title and ⇧↵ opens it on the web")
    func returnKeys() {
        #expect(QuickAddRowCommand(key: .return, characters: "\r", modifiers: []) == .edit)
        #expect(QuickAddRowCommand(key: .return, characters: "\r", modifiers: .shift) == .openOnWeb)
    }

    @Test("X marks done and O opens the link; P no longer pins")
    func letterKeys() {
        func command(_ letter: String, _ modifiers: SwiftUI.EventModifiers = []) -> QuickAddRowCommand? {
            QuickAddRowCommand(key: KeyEquivalent(Character(letter)), characters: letter, modifiers: modifiers)
        }
        #expect(command("x") == .done)
        #expect(command("X", .shift) == .done)
        #expect(command("o") == .openLink)
        #expect(command("n") == .backToField)
        #expect(command("j") == .next)
        #expect(command("k") == .previous)
        #expect(command("p") == nil)
        #expect(command("P", .shift) == nil)
        // ⌘X is the Edit menu's, not Mark done.
        #expect(command("x", .command) == nil)
        #expect(QuickAddRowCommand(key: .downArrow, characters: "", modifiers: []) == .next)
        #expect(QuickAddRowCommand(key: .upArrow, characters: "", modifiers: []) == .previous)
        #expect(QuickAddRowCommand(key: .escape, characters: "", modifiers: []) == .backToField)
    }

    @Test("? brings the keys hint back")
    func questionMarkShowsKeys() {
        #expect(QuickAddRowCommand(key: KeyEquivalent("?"), characters: "?", modifiers: .shift) == .showKeys)
        #expect(QuickAddRowCommand(key: KeyEquivalent("?"), characters: "?", modifiers: [.shift, .command]) == nil)
    }

    @Test("The keys hint names only the keys that aren't obvious, and nothing while a title is edited")
    func keysHintText() {
        #expect(QuickAddKeysHint.text(editing: false) == "⇧↵ open on the web · X done · O link")
        #expect(QuickAddKeysHint.text(editing: true) == nil)
    }

    @Test("The keys hint shows with todos until it's dismissed, wherever the keyboard is")
    func keysHintShows() {
        #expect(QuickAddKeysHint.shows(hasTodos: true, dismissed: false))
        #expect(!QuickAddKeysHint.shows(hasTodos: true, dismissed: true))
        #expect(!QuickAddKeysHint.shows(hasTodos: false, dismissed: false))
    }

    @Test("Dismissing the keys hint is kept in UserDefaults, so it stays gone after a relaunch")
    func keysHintDismissalPersists() throws {
        let suite = "QuickAddKeysHintTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let stored = AppStorage(wrappedValue: false, QuickAddKeysHint.dismissedKey, store: defaults)
        stored.wrappedValue = true
        #expect(defaults.bool(forKey: QuickAddKeysHint.dismissedKey))
        #expect(AppStorage(wrappedValue: false, QuickAddKeysHint.dismissedKey, store: defaults).wrappedValue)
    }

    @Test("Saving a title trims it; an empty or unchanged one keeps the old title")
    func titleEdit() {
        var edit = QuickAddTitleEdit(id: UUID(), original: "Call Kaiser")
        #expect(edit.text == "Call Kaiser")
        #expect(edit.titleToSave == nil)
        edit.text = "  Call Kaiser about the bill "
        #expect(edit.titleToSave == "Call Kaiser about the bill")
        edit.text = "   "
        #expect(edit.titleToSave == nil)
        edit.text = ""
        #expect(edit.titleToSave == nil)
    }

    @Test("⇧↵ opens <web origin>/todo/<id> and closes the popover")
    func openOnWeb() throws {
        let id = try #require(UUID(uuidString: "6F1C2B9A-0D3E-4A5B-8C7D-112233445566"))
        var steps: [String] = []
        QuickAddHandoff.openOnWeb(
            id,
            base: try #require(URL(string: "https://nylonimpossible.com")),
            open: { steps.append("open \($0.absoluteString)") },
            dismiss: { steps.append("dismiss") }
        )
        #expect(steps == ["open https://nylonimpossible.com/todo/6f1c2b9a-0d3e-4a5b-8c7d-112233445566", "dismiss"])
    }

    @Test("The header's web link opens <web origin>/ and closes the popover")
    func openNylon() throws {
        var steps: [String] = []
        QuickAddHandoff.openNylon(
            base: try #require(URL(string: "https://nylonimpossible.com")),
            open: { steps.append("open \($0.absoluteString)") },
            dismiss: { steps.append("dismiss") }
        )
        #expect(steps == ["open https://nylonimpossible.com/", "dismiss"])
    }

    @Test("⌘O is the web link's, and the list leaves it alone (O alone opens a row's link)")
    func webLinkShortcut() {
        #expect(QuickAddHeaderItem.webLinkShortcut.key == KeyEquivalent("o"))
        #expect(QuickAddHeaderItem.webLinkShortcut.modifiers == .command)
        #expect(QuickAddRowCommand(key: KeyEquivalent("o"), characters: "o", modifiers: .command) == nil)
        #expect(QuickAddRowCommand(key: KeyEquivalent("o"), characters: "o", modifiers: []) == .openLink)
    }

    @Test("The link is labelled \"Open Nylon on the web\", and VoiceOver skips the mark")
    func webLinkLabel() {
        #expect(QuickAddHeaderItem.webLinkTitle == "Open Nylon on the web")
        #expect(QuickAddHeaderItem.webLinkSymbol == "rectangle.split.3x1")
        #expect(QuickAddHeaderItem.mark.isDecorative)
        #expect(!QuickAddHeaderItem.webLink.isDecorative)
    }

    @Test("The header is the mark, the title and its count, then the link; signed out, the same with \"Nylon\"")
    func headerItems() {
        #expect(QuickAddHeaderItem.items(signedIn: true, count: 3) == [.mark, .title("Today"), .count(3), .webLink])
        #expect(QuickAddHeaderItem.items(signedIn: true, count: 0) == [.mark, .title("Today"), .webLink])
        #expect(QuickAddHeaderItem.items(signedIn: false) == [.mark, .title("Nylon"), .webLink])
    }

    @Test("The hidden titlebar adds no space above the header")
    func noTitlebarInset() {
        let hosting = NSHostingView(rootView: Text("Today"))
        _ = QuickAddPanel.make(content: hosting)
        #expect(hosting.safeAreaRegions.isEmpty)
    }

    @Test("The web origin sits beside the API")
    func webOrigin() throws {
        func web(_ api: String) throws -> String {
            Config.webBase(forAPI: try #require(URL(string: api))).absoluteString
        }
        #expect(try web("https://api.nylonimpossible.com") == "https://nylonimpossible.com")
        #expect(try web("https://api.preview.example.com/") == "https://preview.example.com")
        #expect(try web("http://localhost:8787") == "http://localhost:3000")
    }
}

@Suite("Send feedback on the Mac")
@MainActor
struct MacFeedbackTests {
    @Test("An admin's footer has Send feedback… between Settings… and Quit Nylon; anyone else's doesn't")
    func footer() {
        #expect(QuickAddFooterItem.items(showsFeedback: true).map(\.title) == ["Settings…", "Send feedback…", "Quit Nylon"])
        #expect(QuickAddFooterItem.items(showsFeedback: false).map(\.title) == ["Settings…", "Quit Nylon"])
    }

    @Test("⇧⌘F, as in the old Help menu")
    func shortcut() {
        #expect(FeedbackService.shortcut.key == KeyEquivalent("f"))
        #expect(FeedbackService.shortcut.modifiers == [.command, .shift])
    }

    @Test("The snapshot is taken before the menu bar window closes, then the form opens with it")
    func handoffOrder() throws {
        let image = try #require(Self.image())
        var steps: [String] = []
        MacFeedbackHandoff.send(
            snapshot: {
                steps.append("snapshot")
                return MacFeedbackSnapshot(image: image, size: CGSize(width: 380, height: 320), colorScheme: .dark)
            },
            close: { steps.append("close") },
            open: { steps.append($0 == nil ? "open" : "open with snapshot") }
        )
        #expect(steps == ["snapshot", "close", "open with snapshot"])
    }

    @Test("A window's snapshot is its content at its size")
    func snapshotOfWindow() throws {
        let size = CGSize(width: 200, height: 120)
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: size), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: Color.red.frame(width: size.width, height: size.height))
        defer { window.close() }
        let snapshot = try #require(MacFeedbackSnapshot.of(window))
        #expect(snapshot.size == size)
        #expect(snapshot.image.width >= Int(size.width))
        #expect(MacFeedbackSnapshot.of(nil) == nil)
    }

    @Test("Send feedback… opens the form in its own window, in front, with the snapshot attached")
    func opensForm() async throws {
        let feedback = FeedbackService(apiService: MockAPIService())
        let form = MacFeedbackWindow(feedback: feedback)
        var activated = 0
        form.activate = { activated += 1 }
        let image = try #require(Self.image())
        let size = CGSize(width: 380, height: 320)

        let attaching = form.show(snapshot: MacFeedbackSnapshot(image: image, size: size, colorScheme: .dark))
        let window = try #require(form.window)
        defer { window.close() }
        #expect(feedback.isPresented)
        #expect(form.isVisible)
        #expect(activated == 1)
        #expect(window.title == "Send feedback")
        let content = try #require(window.contentViewController)
        #expect(String(describing: type(of: content)).contains("MacFeedbackRoot"))
        #expect(feedback.screen == "Menu bar")
        #expect(feedback.viewport == size)
        #expect(feedback.colorScheme == .dark)
        await attaching?.value
        #expect(feedback.images.count == 1)

        // Choosing it again brings the same window back.
        form.show(snapshot: nil)
        #expect(form.window === window)
    }

    @Test("The form opens under the menu bar icon, and stays put while it's open")
    func placement() throws {
        let form = MacFeedbackWindow(feedback: FeedbackService(apiService: MockAPIService()))
        form.activate = {}
        var placed: [NSWindow] = []
        form.place = { placed.append($0) }

        form.show(snapshot: nil)
        let window = try #require(form.window)
        defer { window.close() }
        #expect(placed.count == 1)
        #expect(placed.first === window)
        // Placed at its full size, so it isn't pushed off the screen's edge.
        #expect(window.contentLayoutRect.size == CGSize(width: 560, height: 560))

        form.show(snapshot: nil)
        #expect(placed.count == 1)
    }

    @Test("Closing the window keeps the draft; Cancel drops it")
    func closing() throws {
        let feedback = FeedbackService(apiService: MockAPIService())
        let form = MacFeedbackWindow(feedback: feedback)
        form.activate = {}
        var filed = 0
        form.onFiled = { filed += 1 }
        form.show(snapshot: nil)
        feedback.text = "The tick jumps"
        form.close()
        #expect(!form.isVisible)
        #expect(feedback.isPresented == false)
        #expect(feedback.text == "The tick jumps")

        form.show(snapshot: nil)
        defer { form.window?.close() }
        feedback.discard()
        form.finish()
        #expect(!form.isVisible)
        #expect(filed == 0)
    }

    @Test("Once it's filed, the form closes and the menu bar window comes back for \"Filed #N\"")
    func filed() async throws {
        let api = MockAPIService()
        let feedback = FeedbackService(apiService: api)
        let form = MacFeedbackWindow(feedback: feedback)
        form.activate = {}
        var filed = 0
        form.onFiled = { filed += 1 }
        form.show(snapshot: nil)
        defer { form.window?.close() }
        feedback.text = "The tick jumps"
        #expect(await feedback.submit())
        form.finish()
        #expect(!form.isVisible)
        #expect(filed == 1)
        #expect(api.lastFeedbackRequest?.context.platform == "mac")
        #expect(api.lastFeedbackRequest?.context.screen == "Menu bar")
    }

    private static func image() -> CGImage? {
        let context = CGContext(
            data: nil, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
        context?.setFillColor(CGColor(red: 1, green: 0.9, blue: 0.16, alpha: 1))
        context?.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        return context?.makeImage()
    }
}

@Suite("Mac sign-in")
struct MacSignInTests {
    /// Production Clerk enables only Google and GitHub (email codes are off),
    /// so the Mac must offer exactly those, matching web and iOS.
    @Test("The Mac offers the providers production Clerk enables")
    func providersMatchProduction() {
        #expect(MacSignInView.providers.map(\.provider) == [.google, .github])
        #expect(MacSignInView.providers.map(\.label) == ["Continue with Google", "Continue with GitHub"])
    }

    @Test("Only a complete sign-in or sign-up counts as signed in")
    func completion() {
        var signIn = SignIn.mock
        var signUp = SignUp.mock
        #expect(!MacSignInView.isComplete(.signIn(signIn)))
        #expect(!MacSignInView.isComplete(.signUp(signUp)))
        signIn.status = .complete
        signUp.status = .complete
        #expect(MacSignInView.isComplete(.signIn(signIn)))
        #expect(MacSignInView.isComplete(.signUp(signUp)))
    }
}

/// A sign-in handed to Chrome can stall with no page and no error, so the
/// sheet offers a way out instead of waiting forever.
@Suite("Mac sign-in handoff")
struct MacSignInHandoffTests {
    private let start = Date(timeIntervalSinceReferenceDate: 1_000)

    @Test("Safari is recognised by bundle ID, or by name when that's all there is")
    func classifiesSafari() {
        #expect(MacSignInHandoff.browser(bundleIdentifier: "com.apple.Safari", name: "Safari") == .safari)
        #expect(MacSignInHandoff.browser(bundleIdentifier: "com.apple.SafariTechnologyPreview", name: "Safari Technology Preview") == .safari)
        #expect(MacSignInHandoff.browser(bundleIdentifier: nil, name: "Safari") == .safari)
    }

    @Test("Any other default browser is named")
    func classifiesOthers() {
        #expect(MacSignInHandoff.browser(bundleIdentifier: "com.google.Chrome", name: "Google Chrome") == .other(name: "Google Chrome"))
        #expect(MacSignInHandoff.browser(bundleIdentifier: "com.google.Chrome", name: nil) == .other(name: "your browser"))
        #expect(MacSignInHandoff.browser(bundleIdentifier: nil, name: nil) == .unknown)
    }

    @Test("Help stays hidden until the sign-in has run for a while")
    func helpAfterDelay() {
        var handoff = MacSignInHandoff(browser: .other(name: "Google Chrome"), startedAt: start)
        #expect(!handoff.showsHelp)
        handoff.update(now: start.addingTimeInterval(MacSignInHandoff.helpDelay - 1))
        #expect(!handoff.showsHelp)
        handoff.update(now: start.addingTimeInterval(MacSignInHandoff.helpDelay))
        #expect(handoff.showsHelp)
    }

    @Test("Coming back to the app after the browser took focus shows help")
    func helpOnReturn() {
        var handoff = MacSignInHandoff(browser: .other(name: "Google Chrome"), startedAt: start)
        // Becoming active without having left (the system prompt closing)
        // isn't a return.
        handoff.appDidBecomeActive()
        #expect(!handoff.showsHelp)
        handoff.appDidResignActive()
        #expect(!handoff.showsHelp)
        handoff.appDidBecomeActive()
        #expect(handoff.showsHelp)
    }

    @Test("With Safari, only the delay shows help")
    func safariIgnoresReturn() {
        var handoff = MacSignInHandoff(browser: .safari, startedAt: start)
        handoff.appDidResignActive()
        handoff.appDidBecomeActive()
        #expect(!handoff.showsHelp)
        handoff.update(now: start.addingTimeInterval(MacSignInHandoff.helpDelay))
        #expect(handoff.showsHelp)
    }

    @Test("Only a non-Safari default gets the browser-specific way out")
    func messages() {
        let chrome = MacSignInHandoff(browser: .other(name: "Google Chrome"), startedAt: start)
        #expect(chrome.suggestsSafari)
        #expect(chrome.helpMessage.contains("Google Chrome"))
        #expect(chrome.helpMessage.contains("Safari"))
        #expect(chrome.refusedMessage.contains("Google Chrome"))

        for browser in [MacSignInHandoff.Browser.safari, .unknown] {
            let handoff = MacSignInHandoff(browser: browser, startedAt: start)
            #expect(!handoff.suggestsSafari)
            #expect(!handoff.helpMessage.contains("default browser"))
        }
    }

    @Test("The settings link opens Desktop & Dock")
    func settingsURL() {
        #expect(MacSignInHandoff.defaultBrowserSettingsURL.scheme == "x-apple.systempreferences")
        #expect(MacSignInHandoff.defaultBrowserSettingsURL.absoluteString.hasSuffix("com.apple.Desktop-Settings.extension"))
    }
}

@Suite("Today widget on the Mac desktop")
struct MacWidgetTests {
    private func todos(_ count: Int, meta: Bool = false) -> [WidgetTodo] {
        (0..<count).map {
            WidgetTodo(id: UUID(), title: "Todo \($0)", meta: meta ? [.due("Today", overdue: false)] : [])
        }
    }

    @Test("The entry carries enough rows for the large family")
    func entryCarriesLargeRows() {
        #expect(TodayEntry.maxRows == 10)
    }

    @Test("Large fits a full day; medium keeps its iPhone budget")
    func largeFits() {
        let large = TodayWidgetLayout.budget(for: .systemLarge)
        let medium = TodayWidgetLayout.budget(for: .systemMedium)
        #expect(TodayWidgetLayout.fit(todos(10), total: 10, budget: large) == 10)
        #expect(TodayWidgetLayout.fit(todos(10, meta: true), total: 12, budget: large) >= 6)
        #expect(TodayWidgetLayout.fit(todos(10), total: 10, budget: medium) < 5)
    }

    @Test("The menu bar list and the widget agree on what today is")
    @MainActor
    func digestSelectMatchesFetch() throws {
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let context = container.mainContext
        let now = Date()
        let today = TodoListModel(id: "t", userId: "u", name: "Today", kind: "system", systemKind: .today)
        context.insert(today)
        for (index, due) in [nil, -1, 3, 0].enumerated() {
            let item = TodoItem(title: "Todo \(index)", userId: "u", position: "a\(index)")
            item.listKey = index == 0 ? today.id : "elsewhere"
            item.dueDate = due.map { DueLabel.inDays($0, now: now) }
            context.insert(item)
        }
        try context.save()
        let all = try context.fetch(FetchDescriptor<TodoItem>())
        let selected = TodayDigest.select(all, todayListId: today.id, userId: "u", now: now)
        let fetched = TodayDigest.fetch(userId: "u", context: context, now: now)
        #expect(selected.map(\.id) == fetched.map(\.id))
        #expect(selected.count == 3)
    }
}

/// `SMAppService.mainApp`, as far as the login item sees it.
private final class FakeLoginItemService: LoginItemService {
    var status: SMAppService.Status = .notRegistered
    var registers = 0
    var unregisters = 0
    var fails = false
    /// What `register()` leaves the status as.
    var statusAfterRegister: SMAppService.Status = .enabled

    func register() throws {
        registers += 1
        if fails { throw CocoaError(.featureUnsupported) }
        status = statusAfterRegister
    }

    func unregister() throws {
        unregisters += 1
        if fails { throw CocoaError(.featureUnsupported) }
        status = .notRegistered
    }
}

@Suite("Open at login")
@MainActor
struct MacLoginItemTests {
    private func make(_ service: FakeLoginItemService) throws -> (MacLoginItem, UserDefaults) {
        let suite = "MacLoginItemTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return (MacLoginItem(service: service, defaults: defaults), defaults)
    }

    @Test("The toggle reads the system's state, and switching it registers or unregisters")
    func toggle() throws {
        let service = FakeLoginItemService()
        let (item, _) = try make(service)
        #expect(!item.isOn)
        item.setEnabled(true)
        #expect(service.registers == 1)
        #expect(item.state == .on)
        item.setEnabled(false)
        #expect(service.unregisters == 1)
        #expect(item.state == .off)
        // Removed by hand in System Settings: Settings reads it again on open.
        service.status = .enabled
        item.refresh()
        #expect(item.isOn)
    }

    @Test("A failed register leaves the toggle off, with the failure line")
    func failedRegister() throws {
        let service = FakeLoginItemService()
        service.fails = true
        let (item, _) = try make(service)
        item.setEnabled(true)
        #expect(item.state == .failedToTurnOn)
        #expect(!item.isOn)
    }

    @Test("A failed turn-on stays shown when Settings opens again, until it's tried again")
    func failureStays() throws {
        let service = FakeLoginItemService()
        service.fails = true
        let (item, _) = try make(service)
        item.signedIn(openAtLogin: true)
        item.refresh()
        #expect(item.state == .failedToTurnOn)
        service.fails = false
        item.setEnabled(true)
        #expect(item.state == .on)
        item.setEnabled(false)
        #expect(item.state == .off)
    }

    @Test("A failed turn-off leaves the toggle on, with its own failure line")
    func failedUnregister() throws {
        let service = FakeLoginItemService()
        let (item, _) = try make(service)
        item.setEnabled(true)
        service.fails = true
        item.setEnabled(false)
        #expect(item.state == .failedToTurnOff)
        #expect(item.isOn)
        item.refresh()
        #expect(item.state == .failedToTurnOff)
    }

    @Test("Turning it off in Settings counts as a choice, so the next sign-in starts unticked")
    func settingsChoiceCounts() throws {
        let service = FakeLoginItemService()
        let (item, _) = try make(service)
        item.setEnabled(true)
        item.setEnabled(false)
        #expect(!item.signInDefault)
    }

    @Test("Waiting for approval reads as on, with the approval line")
    func needsApproval() throws {
        let service = FakeLoginItemService()
        service.statusAfterRegister = .requiresApproval
        let (item, _) = try make(service)
        item.setEnabled(true)
        #expect(item.state == .needsApproval)
        #expect(item.isOn)
    }

    @Test("A fresh install registers nothing until sign-in, then follows the checkbox")
    func freshSignIn() throws {
        let ticked = FakeLoginItemService()
        let (item, _) = try make(ticked)
        #expect(ticked.registers == 0)
        #expect(item.signInDefault)
        item.signedIn(openAtLogin: true)
        #expect(ticked.registers == 1)
        #expect(item.isOn)

        let unticked = FakeLoginItemService()
        let (other, _) = try make(unticked)
        other.signedIn(openAtLogin: false)
        #expect(unticked.registers == 0)
        #expect(!other.isOn)
        // Signing in again starts from that "no".
        #expect(!other.signInDefault)
    }
}
#endif
