//
//  QualityPassTests.swift
//  Nylon ImpossibleTests
//
//  Phase 6: what VoiceOver hears for a row and the actions it gets, the
//  toast staying up for assistive tech, the sidebar's counts, the sync error
//  line's words and dismissal, offline work syncing later, and the "New
//  Todo" intent behind the widget's + and the Add todo control.
//

import Foundation
import SwiftData
import SwiftUI
import Testing
@testable import Nylon_Impossible

@MainActor
@Suite("Row accessibility")
struct RowAccessibilityTests {
    private let lists = [
        TodoListModel(id: "today", userId: "u", name: "Today", kind: "system", systemKind: .today),
        TodoListModel(id: "thisweek", userId: "u", name: "This week", kind: "system", systemKind: .thisWeek),
        TodoListModel(id: "someday", userId: "u", name: "Someday", kind: "system", systemKind: .someday),
        TodoListModel(id: "groceries", userId: "u", name: "Groceries", position: "a0")
    ]

    @Test("a row reads title, then meta, then the checkbox")
    func value() {
        #expect(TodoRowAccessibility.value(parts: [], isChecked: false) == "Not done")
        #expect(TodoRowAccessibility.value(parts: [.pinned, .due("Fri", overdue: false)], isChecked: false)
            == "Pinned, Due Fri, Not done")
        #expect(TodoRowAccessibility.value(parts: [.due("3 days overdue", overdue: true)], isChecked: true)
            == "3 days overdue, Done")
    }

    @Test("Mark done comes first, then a Move to every other list, Pin and Delete")
    func actionsInOrder() {
        let todo = TodoItem(title: "Plan Lisbon trip", position: "a0")
        todo.listKey = "THISWEEK"
        let names = TodoRowAccessibility.actions(for: todo, isChecked: false, lists: lists).map(\.name)
        #expect(names == ["Mark done", "Move to Today", "Move to Someday", "Move to Groceries", "Pin to top", "Delete"])
    }

    @Test("a held or pinned row offers the way back")
    func reversibleActions() {
        let todo = TodoItem(title: "Water the plants", position: "a0")
        todo.listKey = "today"
        todo.pinned = true
        let actions = TodoRowAccessibility.actions(for: todo, isChecked: true, lists: lists)
        #expect(actions.first == .markNotDone)
        #expect(actions.contains(.unpin))
        #expect(!actions.contains(.pin))
        // Ids are unique, so SwiftUI keeps each action distinct.
        #expect(Set(actions.map(\.id)).count == actions.count)
    }

    @Test("Done rows finished at the same moment keep one order")
    func doneTieBreak() {
        let at = Date()
        let b = TodoItem(title: "Pick up dry cleaning", position: "a0")
        let a = TodoItem(title: "Email the landlord", position: "a1")
        let newer = TodoItem(title: "Zebra", position: "a2")
        let entries = [(todo: b, at: at), (todo: newer, at: at.addingTimeInterval(60)), (todo: a, at: at)]
        for permutation in [entries, entries.reversed()] {
            let order = permutation.sorted(by: DoneHistoryView.isOrderedBefore).map(\.todo.title)
            #expect(order == ["Zebra", "Email the landlord", "Pick up dry cleaning"])
        }
    }

    @Test("the sidebar's counts read as words")
    func sidebarCounts() {
        #expect(WideSidebar.countText(0) == "No todos")
        #expect(WideSidebar.countText(1) == "1 todo")
        #expect(WideSidebar.countText(12) == "12 todos")
    }
}

@MainActor
@Suite("Toast and assistive tech")
struct ToastAssistiveTests {
    @Test("an Undo toast stays up longer under VoiceOver")
    func longerUnderVoiceOver() {
        let toasts = ToastCenter()
        toasts.usesAssistiveTech = { true }
        #expect(toasts.timeout(hasAction: true) == .seconds(15))
        // Nothing to reach, so no reason to wait.
        #expect(toasts.timeout(hasAction: false) == Theme.Phone.toastDuration)
    }

    @Test("without assistive tech the toast keeps its five seconds")
    func defaultDuration() {
        let toasts = ToastCenter()
        toasts.usesAssistiveTech = { false }
        #expect(toasts.timeout(hasAction: true) == Theme.Phone.toastDuration)
    }

    @Test("VoiceOver's announcement says how to undo")
    func announcement() {
        let toasts = ToastCenter()
        toasts.show("Done", action: {})
        let toast = try? #require(toasts.current)
        #expect(toast.map(ToastView.announcement(for:)) == "Done. Undo: double-tap with two fingers.")
        toasts.show("Couldn’t save that change", action: nil)
        #expect(toasts.current.map(ToastView.announcement(for:)) == "Couldn’t save that change")
    }
}

@MainActor
@Suite("Sync error line")
struct SyncErrorLineTests {
    @Test("the line speaks plainly, without URLs or server bodies")
    func plainWords() {
        let url = "https://api.nylonimpossible.com/todos/sync"
        let cases: [(Error, String)] = [
            (APIError.unauthorized(url: url), "Sign in again to keep syncing."),
            (APIError.serverError(503, "<html>…", url: url), "Nylon’s server had a problem. Your changes are safe here."),
            (APIError.serverError(422, "bad", url: url), "The server didn’t accept the changes."),
            (APIError.networkError(URLError(.cannotFindHost), url: url), "Can’t reach Nylon right now. Your changes are safe here.")
        ]
        for (error, expected) in cases {
            let text = SyncErrorMessage.text(for: error)
            #expect(text == expected)
            #expect(!text.contains("http"))
        }
    }

    @Test("a failed sync shows the line in words, and × puts it away")
    func dismiss() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        api.syncError = APIError.serverError(500, "Internal error", url: "https://api.example.com/todos/sync")
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(container.mainContext)

        await service.sync()
        #expect(service.state == .error("Nylon’s server had a problem. Your changes are safe here."))

        service.dismissError()
        #expect(service.state == .idle)

        // Recovery: the next sync that works stays clear.
        api.syncError = nil
        await service.sync()
        if case .success = service.state {} else { Issue.record("Expected success, got \(service.state)") }
    }

    @Test("work done offline stays queued without a banner, and goes up on the next sync")
    func offlineThenOnline() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let context = container.mainContext
        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        // Added, completed and moved while offline.
        let added = TodoItem(title: "Added offline", userId: auth.userId, position: "a0")
        added.listKey = "today"
        let done = TodoItem(title: "Done offline", userId: auth.userId, position: "a1")
        done.isCompleted = true
        let moved = TodoItem(title: "Moved offline", userId: auth.userId, position: "a2")
        moved.listKey = "someday"
        [added, done, moved].forEach { $0.isSynced = false; context.insert($0) }
        try context.save()

        api.syncError = APIError.networkError(URLError(.notConnectedToInternet), url: "https://api.example.com/todos/sync")
        await service.sync()
        // Offline is expected on a phone: no error line, nothing marked synced.
        #expect(service.state == .idle)
        #expect([added, done, moved].allSatisfy { !$0.isSynced })

        api.syncError = nil
        await service.sync()
        let sent = Set(api.lastSyncRequest?.changes.compactMap(\.title) ?? [])
        #expect(sent.isSuperset(of: ["Added offline", "Done offline", "Moved offline"]))
    }
}

// In QuickActionTests' serialized suite: both use the shared
// QuickActionService, so they mustn't run alongside each other.
extension QuickActionTests {
    @Test("the Add todo control opens the composer on Today")
    func controlOpensToday() async throws {
        let service = QuickActionService.shared
        _ = service.take()
        _ = try await OpenComposerIntent(list: .today).perform()
        #expect(service.take() == .add(list: .today))
    }

    @Test("no list means Today, and a list routes like its deep link")
    func listsRouteLikeDeepLinks() async throws {
        let service = QuickActionService.shared
        _ = service.take()
        _ = try await OpenComposerIntent(list: nil).perform()
        #expect(service.take() == .add(list: .today))

        _ = try await OpenComposerIntent(list: .thisWeek).perform()
        let url = try #require(URL(string: "nylon://add?list=this-week"))
        #expect(service.take() == DeepLink(url: url))

        _ = try await OpenComposerIntent(list: TodoListEntity(id: "groceries", name: "Groceries")).perform()
        #expect(service.take() == .add(list: .list("groceries")))
    }

    @Test("the widget's + and the intent land on the same route")
    func widgetPlusMatchesIntent() async throws {
        let service = QuickActionService.shared
        _ = service.take()
        _ = try await OpenComposerIntent(list: .today).perform()
        let fromIntent = service.take()
        let url = try #require(URL(string: "nylon://add?list=today"))
        #expect(fromIntent == DeepLink(url: url))
    }
}

@MainActor
@Suite("Widget memory")
struct WidgetMemoryTests {
    /// The process's physical footprint, the number the system holds a
    /// widget extension to (about 30 MB).
    private func footprint() -> Int64 {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return result == KERN_SUCCESS ? Int64(info.phys_footprint) : 0
    }

    @Test("the widget's entry from 3,000 open todos stays far under the extension limit")
    func timelineEntryMemory() throws {
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let seed = container.mainContext
        seed.insert(TodoListModel(id: "today", userId: "u", name: "Today", kind: "system", systemKind: .today))
        for index in 0..<3000 {
            let todo = TodoItem(title: "Todo number \(index) with a reasonably long title", userId: "u", position: "a\(index)")
            todo.listKey = index % 3 == 0 ? "today" : "someday"
            todo.itemNotes = String(repeating: "Notes for \(index). ", count: 10)
            todo.dueDate = index % 5 == 0 ? DueLabel.inDays(index % 7 - 3) : nil
            seed.insert(todo)
        }
        try seed.save()

        let before = footprint()
        // What the widget does on each timeline: a fresh context, the digest,
        // and an entry that keeps only the rows it can show.
        let entry: TodayEntry = autoreleasepool {
            let context = ModelContext(container)
            return TodayEntry.make(from: TodayDigest.fetch(userId: "u", context: context))
        }
        let grown = footprint() - before

        guard case .todos(let rows, let total) = entry.content else {
            Issue.record("Expected todos")
            return
        }
        #expect(total > 1000)
        #expect(rows.count <= TodayEntry.maxRows)
        // Generous against noise, and still a third of the limit.
        #expect(grown < 10 * 1024 * 1024, "grew \(grown / 1024) KB")
    }
}
