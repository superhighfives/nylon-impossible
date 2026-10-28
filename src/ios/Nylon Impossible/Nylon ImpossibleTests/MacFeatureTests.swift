//
//  MacFeatureTests.swift
//  Nylon ImpossibleTests
//
//  The Mac's own pieces, as logic: the quick-add hotkey (key codes,
//  modifiers, what Settings shows, what's refused, how it's stored), the Dock
//  badge's count and label, the sign-in providers, and the widget's large
//  family on the desktop. The Carbon registration itself isn't exercised —
//  claiming a system-wide hotkey from a test run would steal it from whatever
//  the machine running the tests is doing.
//

#if os(macOS)
import AppKit
import Carbon.HIToolbox
import ClerkKit
import Foundation
import SwiftData
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
        #expect(fresh.showsMenuBarIcon && fresh.showsDockBadge && fresh.hotKeyEnabled)

        let custom = HotKeyShortcut(keyCode: UInt32(kVK_ANSI_N), modifiers: [.command, .option])
        fresh.hotKey = custom
        fresh.showsDockBadge = false
        let reloaded = MacSettings(defaults: defaults)
        #expect(reloaded.hotKey == custom)
        #expect(!reloaded.showsDockBadge)

        // A stored shortcut that isn't allowed any more is ignored.
        defaults.set(try JSONEncoder().encode(HotKeyShortcut(keyCode: 0, modifiers: [.shift])), forKey: MacSettings.Key.hotKey)
        #expect(MacSettings(defaults: defaults).hotKey == .quickAddDefault)
    }
}

@Suite("Dock badge")
@MainActor
struct DockBadgeTests {
    private static let userId = "user_badge"

    private func makeContainer() throws -> ModelContainer {
        try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
    }

    /// Today: two open, one done. Someday: one undated, one overdue.
    private func seed(_ context: ModelContext, now: Date) {
        let today = TodoListModel(id: "today", userId: Self.userId, name: "Today", kind: "system", systemKind: .today)
        let someday = TodoListModel(id: "someday", userId: Self.userId, name: "Someday", kind: "system", systemKind: .someday)
        context.insert(today)
        context.insert(someday)
        func todo(_ title: String, _ list: TodoListModel, due: Int? = nil, done: Bool = false) {
            let item = TodoItem(title: title, userId: Self.userId, position: "a0")
            item.listKey = list.id
            item.dueDate = due.map { DueLabel.inDays($0, now: now) }
            item.isCompleted = done
            context.insert(item)
        }
        todo("Review PR", today)
        todo("Call Mum", today)
        todo("Email the landlord", today, done: true)
        todo("Read Piranesi", someday)
        todo("Renew passport", someday, due: -2)
        try? context.save()
    }

    @Test("The label is the count, and nothing at zero")
    func label() {
        #expect(DockBadgeController.label(for: 0) == nil)
        #expect(DockBadgeController.label(for: 3) == "3")
        #expect(DockBadgeController.label(for: 120) == "120")
    }

    @Test("The count is today's open todos: the Today list plus anything due")
    func count() throws {
        let container = try makeContainer()
        let now = Date()
        seed(container.mainContext, now: now)
        #expect(DockBadgeController.count(userId: Self.userId, context: container.mainContext, now: now) == 3)
        #expect(DockBadgeController.count(userId: nil, context: container.mainContext, now: now) == 0)
        #expect(DockBadgeController.count(userId: "someone-else", context: container.mainContext, now: now) == 0)
    }

    @Test("Refresh pushes the label, and the Settings toggle clears it")
    func refreshFollowsSetting() throws {
        let container = try makeContainer()
        seed(container.mainContext, now: Date())
        let suite = "nylon-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let settings = MacSettings(defaults: defaults)

        var applied: [String?] = []
        let badge = DockBadgeController()
        badge.apply = { applied.append($0) }
        badge.currentUserId = { Self.userId }
        badge.attach(container: container, settings: settings)

        badge.refresh()
        settings.showsDockBadge = false
        badge.refresh()
        #expect(applied == ["3", nil])
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
#endif
