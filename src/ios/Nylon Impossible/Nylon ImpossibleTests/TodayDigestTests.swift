import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

@Suite("TodayDigest")
struct TodayDigestTests {
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoMessage.self, TodoSuggestion.self, TodoListModel.self,
            configurations: config
        )
    }

    /// Midday, so "today" has room either side of it in the same local day.
    private let now = Calendar.current.date(
        bySettingHour: 12, minute: 0, second: 0, of: Date()
    )!

    private let userId = "user_123"

    @discardableResult
    private func insert(
        _ context: ModelContext,
        title: String,
        dueDate: Date?,
        userId: String? = "user_123",
        position: String = "a0",
        completed: Bool = false,
        completedAt: Date? = nil,
        deleted: Bool = false,
        sticky: Bool = false,
        parentId: UUID? = nil,
        recurrence: Recurrence? = nil
    ) -> TodoItem {
        let todo = TodoItem(title: title, userId: userId, position: position)
        todo.dueDate = dueDate
        todo.isCompleted = completed
        todo.completedAt = completedAt
        todo.isDeleted = deleted
        todo.sticky = sticky
        todo.parentId = parentId
        todo.recurrence = recurrence
        context.insert(todo)
        return todo
    }

    // MARK: - startOfTomorrow

    @Test("startOfTomorrow is local midnight after the given date")
    func startOfTomorrowIsNextLocalMidnight() {
        let cutoff = TodayDigest.startOfTomorrow(after: now)
        let calendar = Calendar.current

        #expect(cutoff > now)
        #expect(calendar.component(.hour, from: cutoff) == 0)
        #expect(calendar.component(.minute, from: cutoff) == 0)
        #expect(calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: cutoff).day == 1)
    }

    // MARK: - What counts as due

    @Test("Includes todos due today and overdue, excludes later ones")
    @MainActor
    func includesTodayAndOverdue() throws {
        let context = try makeContainer().mainContext

        insert(context, title: "Overdue", dueDate: now.addingTimeInterval(-86_400))
        insert(context, title: "Later today", dueDate: now.addingTimeInterval(3600))
        insert(context, title: "Tomorrow", dueDate: now.addingTimeInterval(86_400))
        insert(context, title: "No due date", dueDate: nil)

        let due = TodayDigest.fetch(userId: userId, context: context, now: now)

        #expect(due.map(\.title) == ["Overdue", "Later today"])
    }

    @Test("Excludes completed, deleted, and subtask todos")
    @MainActor
    func excludesNonEligible() throws {
        let context = try makeContainer().mainContext
        let dueToday = now.addingTimeInterval(-60)

        insert(context, title: "Open", dueDate: dueToday)
        insert(context, title: "Completed", dueDate: dueToday, completed: true)
        insert(context, title: "Deleted", dueDate: dueToday, deleted: true)
        insert(context, title: "Subtask", dueDate: dueToday, parentId: UUID())

        let due = TodayDigest.fetch(userId: userId, context: context, now: now)

        #expect(due.map(\.title) == ["Open"])
    }

    @Test("Excludes a repeat completed today, which the app still shows as done")
    @MainActor
    func excludesRepeatCompletedToday() throws {
        let context = try makeContainer().mainContext

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

        #expect(TodayDigest.fetch(userId: userId, context: context, now: now).isEmpty)
    }

    @Test("Excludes other users' todos and signed-out local ones")
    @MainActor
    func scopesToUser() throws {
        let context = try makeContainer().mainContext
        let dueToday = now.addingTimeInterval(-60)

        insert(context, title: "Mine", dueDate: dueToday)
        insert(context, title: "Theirs", dueDate: dueToday, userId: "user_456")
        insert(context, title: "Local only", dueDate: dueToday, userId: nil)

        let due = TodayDigest.fetch(userId: userId, context: context, now: now)

        #expect(due.map(\.title) == ["Mine"])
    }

    // MARK: - Order

    @Test("Sticky first, then soonest due, then position")
    @MainActor
    func ordersStickyThenDueThenPosition() throws {
        let context = try makeContainer().mainContext

        insert(context, title: "Same day, later position", dueDate: now, position: "a2")
        insert(context, title: "Same day, earlier position", dueDate: now, position: "a1")
        insert(context, title: "Overdue", dueDate: now.addingTimeInterval(-86_400), position: "a9")
        insert(context, title: "Pinned", dueDate: now, position: "a9", sticky: true)

        let due = TodayDigest.fetch(userId: userId, context: context, now: now)

        #expect(due.map(\.title) == [
            "Pinned",
            "Overdue",
            "Same day, earlier position",
            "Same day, later position",
        ])
    }

    @Test("Limit truncates the list without changing its order")
    @MainActor
    func limitTruncates() throws {
        let context = try makeContainer().mainContext

        insert(context, title: "First", dueDate: now, position: "a1")
        insert(context, title: "Second", dueDate: now, position: "a2")
        insert(context, title: "Third", dueDate: now, position: "a3")

        let due = TodayDigest.fetch(userId: userId, limit: 2, context: context, now: now)

        #expect(due.map(\.title) == ["First", "Second"])
    }

    @Test("An empty store is empty, not an error")
    @MainActor
    func emptyStore() throws {
        let context = try makeContainer().mainContext
        #expect(TodayDigest.fetch(userId: userId, context: context, now: now).isEmpty)
    }
}
