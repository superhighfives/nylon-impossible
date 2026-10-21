import Testing
import UIKit
@testable import Nylon_Impossible

@Suite("QuickAction", .serialized)
@MainActor
struct QuickActionTests {
    private func shortcutItem(type: String) -> UIApplicationShortcutItem {
        UIApplicationShortcutItem(type: type, localizedTitle: "New todo")
    }

    // MARK: - Mapping shortcut items

    @Test("Maps the new-task shortcut item to .newTask")
    func mapsNewTask() {
        let item = shortcutItem(type: "com.superhighfives.Nylon-Impossible.new-task")
        #expect(QuickAction(item) == .newTask)
    }

    @Test("Ignores an unrecognised shortcut item")
    func ignoresUnknown() {
        #expect(QuickAction(shortcutItem(type: "com.example.something-else")) == nil)
    }

    // MARK: - Info.plist declarations

    /// The Info.plist and the enum are two halves of the same contract, and a
    /// typo in either only shows up as a quick action that silently does
    /// nothing on a real device. The test target is app-hosted, so
    /// `Bundle.main` here is the app bundle.
    @Test("Every declared shortcut item is one the app can perform")
    func declaredItemsAreHandled() throws {
        let declared = Bundle.main.object(forInfoDictionaryKey: "UIApplicationShortcutItems")
            as? [[String: Any]]
        let items = try #require(declared)
        #expect(!items.isEmpty)

        for item in items {
            let type = item["UIApplicationShortcutItemType"] as? String
            #expect(QuickAction(rawValue: type ?? "") != nil, "Unhandled shortcut item type: \(type ?? "nil")")
            let title = item["UIApplicationShortcutItemTitle"] as? String
            #expect(title?.isEmpty == false)
        }
    }

    @Test("Declares a New todo shortcut item")
    func declaresNewTask() {
        let declared = Bundle.main.object(forInfoDictionaryKey: "UIApplicationShortcutItems")
            as? [[String: Any]] ?? []
        let newTask = declared.first {
            $0["UIApplicationShortcutItemType"] as? String == QuickAction.newTask.rawValue
        }
        #expect(newTask?["UIApplicationShortcutItemTitle"] as? String == "New todo")
    }

    // MARK: - Handing off to the UI

    @Test("take() returns the pending action and clears it")
    func takeConsumesOnce() {
        let service = QuickActionService.shared
        service.post(.newTask)
        #expect(service.pending == .add(list: .today))
        #expect(service.take() == .add(list: .today))
        // Cleared, so returning to the app later doesn't replay it.
        #expect(service.pending == nil)
        #expect(service.take() == nil)
    }

    @Test("The quick action takes the same route as nylon://add?list=today")
    func quickActionMatchesDeepLink() throws {
        let url = try #require(URL(string: "nylon://add?list=today"))
        #expect(QuickAction.newTask.deepLink == DeepLink(url: url))
    }

    @Test("A posted deep link waits for take()")
    func postsDeepLink() {
        let service = QuickActionService.shared
        service.post(.add(list: .thisWeek))
        #expect(service.take() == .add(list: .thisWeek))
        #expect(service.take() == nil)
    }

    @Test("take() with nothing pending is a no-op")
    func takeWithNothingPending() {
        let service = QuickActionService.shared
        _ = service.take()
        #expect(service.take() == nil)
    }
}
