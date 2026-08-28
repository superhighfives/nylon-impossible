import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

@Suite("TodayDigest")
struct TodayDigestTests {
    /// The same model set `SyncServiceTests` and `ConversationSyncTests` use.
    /// `TodoListModel` is in it because the digest resolves the Today list to
    /// scope by — without it the fetch has no such entity to ask for.
    ///
    /// **Bind the result to a local and take `mainContext` from that**, as
    /// every other suite here does. `try makeContainer().mainContext` releases
    /// the container as the expression ends and leaves the context holding a
    /// deallocated one; SwiftData traps the next time it touches it, which
    /// takes the whole test process down — every pending test in it, across
    /// every suite — rather than failing anything here.
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoMessage.self, TodoSuggestion.self,
            TodoListModel.self,
            configurations: config
        )
    }

    /// Midday today, so the fixtures have room either side of them within the
    /// same local day. A plain offset from `startOfDay` rather than
    /// `date(bySettingHour:)`, which searches *forward* — after noon that hands
    /// back midday tomorrow, and it returns an optional that has to be unwrapped.
    ///
    /// A `static` computed property, not a stored one: Swift Testing builds a
    /// fresh suite instance for every test case, so anything stored on the
    /// suite is re-evaluated per test. Every other suite in this target keeps
    /// its fixtures in a `static let` or a local for the same reason.
    private static var now: Date {
        Calendar.current.startOfDay(for: Date()).addingTimeInterval(12 * 60 * 60)
    }

    private static let userId = "user_123"

    /// Server list ids are dashless lowercase hex, not UUIDs — see
    /// `TodoItem.listKey`. Nothing here depends on the shape beyond it being
    /// an opaque string, but matching it keeps the fixtures honest.
    private static let todayListId = "fb56f07a1c4d4e0b9a2f7c8e5d3b1a09"
    private static let sometimeListId = "0a1b3d5e8c7f2a9b0e4d4c1a70f65bf0"

    /// The two system lists these tests place todos in. Sometime is here as
    /// the "somewhere else" every list-scoped test needs to contrast against.
    private func insertLists(_ context: ModelContext, userId: String = TodayDigestTests.userId) {
        context.insert(TodoListModel(
            id: Self.todayListId, userId: userId, name: "Today",
            kind: "system", systemKind: .today, position: "a0"
        ))
        context.insert(TodoListModel(
            id: Self.sometimeListId, userId: userId, name: "Sometime",
            kind: "system", systemKind: .sometime, position: "a2"
        ))
    }

    @discardableResult
    private func insert(
        _ context: ModelContext,
        title: String,
        dueDate: Date?,
        userId: String? = TodayDigestTests.userId,
        listKey: String? = nil,
        position: String = "a0",
        completed: Bool = false,
        completedAt: Date? = nil,
        deleted: Bool = false,
        sticky: Bool = false,
        parentId: UUID? = nil,
        recurrence: Recurrence? = nil
    ) -> TodoItem {
        let todo = TodoItem(title: title, userId: userId, position: position)
        // Insert before mutating, matching the order the app uses
        // (`TaskCreationService.createTask` inserts, then edits).
        context.insert(todo)
        todo.dueDate = dueDate
        todo.listKey = listKey
        todo.isCompleted = completed
        todo.completedAt = completedAt
        todo.isDeleted = deleted
        todo.sticky = sticky
        todo.parentId = parentId
        todo.recurrence = recurrence
        return todo
    }

    // MARK: - startOfTomorrow

    @Test("startOfTomorrow is local midnight after the given date")
    func startOfTomorrowIsNextLocalMidnight() {
        let now = Self.now
        let cutoff = TodayDigest.startOfTomorrow(after: now)
        let calendar = Calendar.current

        #expect(cutoff > now)
        #expect(calendar.component(.hour, from: cutoff) == 0)
        #expect(calendar.component(.minute, from: cutoff) == 0)
        #expect(calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: cutoff).day == 1)
    }

    // MARK: - What counts as today

    @Test("Includes todos due today and overdue, excludes later ones")
    @MainActor
    func includesTodayAndOverdue() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext

        insert(context, title: "Overdue", dueDate: now.addingTimeInterval(-86_400))
        insert(context, title: "Later today", dueDate: now.addingTimeInterval(3600))
        insert(context, title: "Tomorrow", dueDate: now.addingTimeInterval(86_400))
        insert(context, title: "No due date", dueDate: nil)

        let due = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(due.map(\.title) == ["Overdue", "Later today"])
    }

    @Test("Includes everything on the Today list, due date or not")
    @MainActor
    func includesTheTodayList() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext
        insertLists(context)

        // A Today item means "I want to work on this today" — its due date, if
        // it has one at all, is unrelated to why it's there.
        insert(context, title: "Undated", dueDate: nil, listKey: Self.todayListId, position: "a1")
        insert(
            context, title: "Due in three weeks",
            dueDate: now.addingTimeInterval(21 * 86_400), listKey: Self.todayListId, position: "a2"
        )
        insert(context, title: "Parked", dueDate: nil, listKey: Self.sometimeListId, position: "a3")

        let forToday = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(forToday.map(\.title) == ["Due in three weeks", "Undated"])
    }

    @Test("Still includes what's due or overdue in another list")
    @MainActor
    func includesDueFromOtherLists() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext
        insertLists(context)

        // Reaching a due date never promotes a todo into Today, so the widget
        // has to reach across lists for these or they go unseen all day.
        insert(
            context, title: "Overdue in Sometime",
            dueDate: now.addingTimeInterval(-86_400), listKey: Self.sometimeListId
        )
        insert(context, title: "On the list", dueDate: nil, listKey: Self.todayListId)

        let forToday = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(forToday.map(\.title) == ["Overdue in Sometime", "On the list"])
    }

    @Test("Excludes another user's Today list")
    @MainActor
    func scopesTheTodayListToUser() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext
        insertLists(context, userId: "user_456")

        // Same list id, another account's list row: nothing here belongs to
        // the signed-in user, so nothing but the due date can put it on the
        // widget.
        insert(context, title: "Theirs, undated", dueDate: nil, listKey: Self.todayListId)

        #expect(TodayDigest.fetch(userId: Self.userId, context: context, now: now).isEmpty)
    }

    @Test("Falls back to due dates when the lists haven't synced yet")
    @MainActor
    func fallsBackWithoutLists() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext

        // No `TodoListModel` rows at all — a fresh install where the widget
        // reads the store before the first sync lands.
        insert(context, title: "Due today", dueDate: now, listKey: Self.todayListId)
        insert(context, title: "Undated", dueDate: nil, listKey: Self.todayListId)

        let forToday = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(forToday.map(\.title) == ["Due today"])
    }

    @Test("A repeat completed today doesn't come back via its list")
    @MainActor
    func excludesCompletedRepeatOnTheTodayList() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext
        insertLists(context)

        // Completing a repeat rolls its dueDate past the cutoff, which is what
        // used to keep it off the widget. Now that list membership can put a
        // todo here on its own, `isEffectivelyCompleted` is the only thing
        // still holding it back until midnight.
        insert(
            context, title: "Watered the plants",
            dueDate: now.addingTimeInterval(86_400), listKey: Self.todayListId,
            completedAt: now, recurrence: Recurrence(frequency: .daily)
        )

        #expect(TodayDigest.fetch(userId: Self.userId, context: context, now: now).isEmpty)
    }

    @Test("Excludes completed, deleted, and subtask todos")
    @MainActor
    func excludesNonEligible() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext
        let dueToday = now.addingTimeInterval(-60)

        insert(context, title: "Open", dueDate: dueToday)
        insert(context, title: "Completed", dueDate: dueToday, completed: true)
        insert(context, title: "Deleted", dueDate: dueToday, deleted: true)
        insert(context, title: "Subtask", dueDate: dueToday, parentId: UUID())

        let due = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(due.map(\.title) == ["Open"])
    }

    @Test("Excludes a repeat completed today, which the app still shows as done")
    @MainActor
    func excludesRepeatCompletedToday() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext

        // Completing a repeat rolls its dueDate forward and stamps completedAt
        // rather than setting isCompleted — it reads as done until local
        // midnight, so it has no business back on the widget before then.
        insert(
            context,
            title: "Watered the plants",
            dueDate: now.addingTimeInterval(-3600),
            completedAt: now,
            recurrence: Recurrence(frequency: .daily)
        )

        #expect(TodayDigest.fetch(userId: Self.userId, context: context, now: now).isEmpty)
    }

    @Test("Excludes other users' todos and signed-out local ones")
    @MainActor
    func scopesToUser() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext
        let dueToday = now.addingTimeInterval(-60)

        insert(context, title: "Mine", dueDate: dueToday)
        insert(context, title: "Theirs", dueDate: dueToday, userId: "user_456")
        insert(context, title: "Local only", dueDate: dueToday, userId: nil)

        let due = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(due.map(\.title) == ["Mine"])
    }

    // MARK: - Order

    @Test("Sticky first, then soonest due, then position")
    @MainActor
    func ordersStickyThenDueThenPosition() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext

        insert(context, title: "Same day, later position", dueDate: now, position: "a2")
        insert(context, title: "Same day, earlier position", dueDate: now, position: "a1")
        insert(context, title: "Overdue", dueDate: now.addingTimeInterval(-86_400), position: "a9")
        insert(context, title: "Pinned", dueDate: now, position: "a9", sticky: true)

        let due = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(due.map(\.title) == [
            "Pinned",
            "Overdue",
            "Same day, earlier position",
            "Same day, later position",
        ])
    }

    @Test("Undated Today items sort below everything with a date, by position")
    @MainActor
    func ordersUndatedLast() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext
        insertLists(context)

        insert(context, title: "Undated, later position", dueDate: nil, listKey: Self.todayListId, position: "a2")
        insert(context, title: "Undated, earlier position", dueDate: nil, listKey: Self.todayListId, position: "a1")
        insert(context, title: "Overdue", dueDate: now.addingTimeInterval(-3600), position: "a9")
        insert(context, title: "Pinned and undated", dueDate: nil, listKey: Self.todayListId, position: "a9", sticky: true)

        let forToday = TodayDigest.fetch(userId: Self.userId, context: context, now: now)

        #expect(forToday.map(\.title) == [
            "Pinned and undated",
            "Overdue",
            "Undated, earlier position",
            "Undated, later position",
        ])
    }

    @Test("Limit truncates the list without changing its order")
    @MainActor
    func limitTruncates() throws {
        let now = Self.now
        let container = try makeContainer()
        let context = container.mainContext

        insert(context, title: "First", dueDate: now, position: "a1")
        insert(context, title: "Second", dueDate: now, position: "a2")
        insert(context, title: "Third", dueDate: now, position: "a3")

        let due = TodayDigest.fetch(userId: Self.userId, limit: 2, context: context, now: now)

        #expect(due.map(\.title) == ["First", "Second"])
    }

    @Test("An empty store is empty, not an error")
    @MainActor
    func emptyStore() throws {
        let container = try makeContainer()
        let context = container.mainContext
        #expect(TodayDigest.fetch(userId: Self.userId, context: context, now: Self.now).isEmpty)
    }
}
