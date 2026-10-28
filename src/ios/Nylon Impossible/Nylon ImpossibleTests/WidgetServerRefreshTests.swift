import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

/// The iOS widget's server pull: what it writes to the store, what it leaves
/// alone, and that the digest it renders afterwards is `TodayDigest`'s.
@Suite("WidgetServerRefresh")
struct WidgetServerRefreshTests {
    /// Bind the container to a local before taking `mainContext` from it; see
    /// `TodayDigestTests.makeContainer`.
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: config
        )
    }

    private static var now: Date {
        Calendar.current.startOfDay(for: Date()).addingTimeInterval(12 * 60 * 60)
    }

    private static let userId = "user_123"
    private static let todayListId = "fb56f07a1c4d4e0b9a2f7c8e5d3b1a09"
    private static let somedayListId = "0a1b3d5e8c7f2a9b0e4d4c1a70f65bf0"
    private static let past = Date(timeIntervalSince1970: 1_800_000_000)
    private static let later = past.addingTimeInterval(3_600)

    private static var lists: [APIList] {
        [
            APIList(
                id: todayListId, userId: userId, name: "Today", kind: "system",
                systemKind: "today", position: "a0", createdAt: past, updatedAt: past
            ),
            APIList(
                id: somedayListId, userId: userId, name: "Someday", kind: "system",
                systemKind: "someday", position: "a2", createdAt: past, updatedAt: past
            )
        ]
    }

    private func remote(
        _ id: UUID,
        title: String,
        listId: String? = WidgetServerRefreshTests.todayListId,
        completed: Bool = false,
        updatedAt: Date = WidgetServerRefreshTests.later
    ) -> APITodo {
        APITodo(
            id: id.uuidString.lowercased(), userId: Self.userId, listId: listId, title: title,
            completed: completed, position: "a0", createdAt: Self.past, updatedAt: updatedAt
        )
    }

    @discardableResult
    private func local(
        _ context: ModelContext,
        id: UUID = UUID(),
        title: String,
        listKey: String? = WidgetServerRefreshTests.todayListId,
        userId: String = WidgetServerRefreshTests.userId,
        synced: Bool = true,
        deleted: Bool = false,
        updatedAt: Date = WidgetServerRefreshTests.past
    ) -> TodoItem {
        let todo = TodoItem(title: title, userId: userId)
        context.insert(todo)
        todo.id = id
        todo.listKey = listKey
        todo.isSynced = synced
        todo.isSoftDeleted = deleted
        todo.updatedAt = updatedAt
        return todo
    }

    private func digestTitles(_ context: ModelContext) -> [String] {
        TodayDigest.fetch(userId: Self.userId, context: context, now: Self.now).map(\.title)
    }

    private func merge(_ todos: [APITodo], lists: [APIList]? = nil, into context: ModelContext) throws {
        try WidgetServerRefresh.merge(
            .init(todos: todos, lists: lists ?? Self.lists),
            userId: Self.userId,
            into: context
        )
    }

    // MARK: - Merge

    @Test("A row only on the server is added, and shows in the digest")
    @MainActor
    func insertsServerOnlyRows() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let id = UUID()

        try merge([remote(id, title: "Added on the web")], into: context)

        #expect(digestTitles(context) == ["Added on the web"])
        // In the store, so `CompleteTodoIntent` can find it.
        let stored = try #require(try context.fetch(FetchDescriptor<TodoItem>()).first)
        #expect(stored.id == id)
        #expect(stored.isSynced)
    }

    @Test("A newer server row overwrites a synced local one")
    @MainActor
    func newerServerRowWins() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let id = UUID()
        local(context, id: id, title: "Old title", listKey: Self.somedayListId)

        try merge([remote(id, title: "Renamed on the web", listId: Self.todayListId)], into: context)

        #expect(digestTitles(context) == ["Renamed on the web"])
    }

    @Test("A server row completed elsewhere leaves the digest")
    @MainActor
    func completedElsewhereDrops() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let id = UUID()
        local(context, id: id, title: "Done on the web")

        try merge([remote(id, title: "Done on the web", completed: true)], into: context)

        #expect(digestTitles(context).isEmpty)
    }

    @Test("An older server row doesn't overwrite the local one")
    @MainActor
    func olderServerRowLoses() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let id = UUID()
        local(context, id: id, title: "Local", updatedAt: Self.later)

        try merge([remote(id, title: "Stale server", updatedAt: Self.past)], into: context)

        #expect(digestTitles(context) == ["Local"])
    }

    /// The widget's tick marks the row unsynced and tries to upload it; if
    /// that failed, the next refresh must not bring the row back.
    @Test("A pending local change wins over a newer server row")
    @MainActor
    func pendingLocalChangeWins() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let id = UUID()
        let todo = local(context, id: id, title: "Ticked on the widget", synced: false)
        todo.isCompleted = true

        try merge([remote(id, title: "Server copy", completed: false)], into: context)

        #expect(digestTitles(context).isEmpty)
        #expect(todo.title == "Ticked on the widget")
        #expect(!todo.isSynced)
    }

    @Test("A pending local delete isn't undone by the server row")
    @MainActor
    func pendingDeleteWins() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let id = UUID()
        let todo = local(context, id: id, title: "Deleted here", synced: false, deleted: true)

        try merge([remote(id, title: "Deleted here")], into: context)

        #expect(todo.isSoftDeleted)
        #expect(digestTitles(context).isEmpty)
    }

    @Test("A synced row the server no longer has is soft-deleted, not removed")
    @MainActor
    func goneOnServerIsSoftDeleted() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let gone = local(context, title: "Deleted on the web")
        let unsynced = local(context, title: "Made offline", synced: false)
        let otherUser = local(context, title: "Someone else's", userId: "user_other")

        try merge([], into: context)

        #expect(gone.isSoftDeleted)
        #expect(gone.isSynced)
        #expect(!unsynced.isSoftDeleted)
        #expect(!otherUser.isSoftDeleted)
        #expect(digestTitles(context) == ["Made offline"])
        #expect(try context.fetch(FetchDescriptor<TodoItem>()).count == 3)
    }

    /// A fresh install where the widget runs before the app has synced lists:
    /// the server's lists are what let the digest find the Today list.
    @Test("Lists are added when missing, so the Today list resolves")
    @MainActor
    func insertsLists() throws {
        let container = try makeContainer()
        let context = container.mainContext

        try merge([remote(UUID(), title: "Undated, on Today")], into: context)

        #expect(try context.fetch(FetchDescriptor<TodoListModel>()).count == 2)
        #expect(digestTitles(context) == ["Undated, on Today"])
    }

    @Test("Running the same merge twice changes nothing the second time")
    @MainActor
    func idempotent() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let rows = [remote(UUID(), title: "One"), remote(UUID(), title: "Two")]

        try merge(rows, into: context)
        try merge(rows, into: context)

        #expect(try context.fetch(FetchDescriptor<TodoItem>()).count == 2)
        #expect(try context.fetch(FetchDescriptor<TodoListModel>()).count == 2)
        #expect(!context.hasChanges)
    }

    // MARK: - Timeline

    @Test("Next reload is half an hour away during the day")
    func reloadsEveryHalfHour() {
        let now = Self.now
        #expect(WidgetServerRefresh.nextReload(after: now) == now.addingTimeInterval(30 * 60))
    }

    @Test("Next reload is midnight when that's sooner")
    func reloadsAtMidnight() {
        let midnight = TodayDigest.startOfTomorrow(after: Self.now)
        let lateEvening = midnight.addingTimeInterval(-10 * 60)
        #expect(WidgetServerRefresh.nextReload(after: lateEvening) == midnight)
    }

    // MARK: - Deadline

    @Test("A fetch that finishes in time returns its value")
    @MainActor
    func deadlineReturnsValue() async {
        let value = await WidgetServerRefresh.withDeadline(.seconds(5)) { 42 }
        #expect(value == 42)
    }

    /// Runs off the main actor, as the deadline does: other suites share the
    /// main actor in parallel and held it for seconds on CI's iPad runner, so
    /// a main-actor test measured the queue, not the deadline.
    @Test("A fetch that ignores cancellation still gives up at the deadline")
    nonisolated func deadlineGivesUp() async {
        let start = ContinuousClock.now
        let value: Int? = await WidgetServerRefresh.withDeadline(.milliseconds(100)) {
            // A detached sleep can't be cancelled from here, like a Clerk
            // client refresh that doesn't check for cancellation.
            await Task.detached { try? await Task.sleep(for: .seconds(10)) }.value
            return 1
        }
        #expect(value == nil)
        #expect(ContinuousClock.now - start < .seconds(8))
    }
}
