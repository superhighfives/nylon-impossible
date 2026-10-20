import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("Row meta and date words")
struct TodoMetaTests {
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.locale = Locale(identifier: "en_US_POSIX")
        return calendar
    }()
    private static let locale = Locale(identifier: "en_US_POSIX")
    /// Sunday, October 18 2026, midday UTC.
    private static let now = Date(timeIntervalSince1970: 1_792_324_800)

    private func day(_ offset: Int) -> Date {
        DueLabel.inDays(offset, now: Self.now, calendar: Self.calendar)
    }

    private func label(_ offset: Int) -> (text: String, overdue: Bool) {
        DueLabel.text(for: day(offset), now: Self.now, calendar: Self.calendar, locale: Self.locale)
    }

    @Test("now is a Sunday")
    func fixture() {
        #expect(Self.calendar.component(.weekday, from: Self.now) == 1)
    }

    @Test("due labels: Today, Tomorrow, weekday, month day")
    func dueLabels() {
        #expect(label(0).text == "Today")
        #expect(label(1).text == "Tomorrow")
        #expect(label(5).text == "Fri")
        #expect(label(6).text == "Sat")
        #expect(label(12).text == "Oct 30")
        #expect(label(0).overdue == false)
    }

    @Test("overdue labels count days and read red")
    func overdueLabels() {
        #expect(label(-1).text == "1 day overdue")
        #expect(label(-4).text == "4 days overdue")
        #expect(label(-4).overdue)
    }

    @Test("a date in another year carries the year")
    func otherYear() {
        #expect(label(90).text == "Jan 16, 2027")
    }

    @Test("composer chip copy")
    func chip() {
        #expect(DueLabel.chip(for: day(5), now: Self.now, calendar: Self.calendar) == "Due Fri")
    }

    @Test("upcoming weekday skips today, like the typed-date parser")
    func upcoming() {
        // Friday from Sunday is five days out; Sunday from Sunday is a week.
        #expect(DueLabel.upcoming(weekday: 6, now: Self.now, calendar: Self.calendar) == day(5))
        #expect(DueLabel.upcoming(weekday: 1, now: Self.now, calendar: Self.calendar) == day(7))
        // "Next week" is the Monday after today.
        #expect(DueLabel.upcoming(weekday: 2, now: Self.now, calendar: Self.calendar) == day(1))
    }

    @Test("meta parts appear only when set, in spec order")
    func partsOrder() {
        let todo = TodoItem(title: "Plan Lisbon trip")
        todo.pinned = true
        todo.dueDate = day(5)
        todo.recurrence = Recurrence(frequency: .weekly)
        todo.itemNotes = "Flights land Thursday"
        todo.pendingUrls = ["https://www.visitlisboa.com/tram-28"]
        let done = TodoItem(title: "Book flights")
        done.isCompleted = true
        let open = TodoItem(title: "Find an apartment")

        let parts = TodoMeta.parts(
            for: todo, subtasks: [done, open], now: Self.now, calendar: Self.calendar, locale: Self.locale
        )
        #expect(parts == [
            .pinned,
            .due("Fri", overdue: false),
            .repeats("Weekly"),
            .subtasks(done: 1, total: 2),
            .notes,
            .link("visitlisboa.com")
        ])
    }

    @Test("a bare todo has no meta line; blank notes don't count")
    func emptyParts() {
        let todo = TodoItem(title: "Read Piranesi")
        todo.itemNotes = "   \n"
        #expect(TodoMeta.parts(for: todo, subtasks: []).isEmpty)
    }

    @Test("deleted subtasks drop out of n/m")
    func deletedSubtasks() {
        let todo = TodoItem(title: "Parent")
        let gone = TodoItem(title: "Gone")
        gone.isSoftDeleted = true
        let kept = TodoItem(title: "Kept")
        #expect(TodoMeta.parts(for: todo, subtasks: [gone, kept]) == [.subtasks(done: 0, total: 1)])
    }

    @Test("day labels for the Done history and footer")
    func dayLabels() {
        let yesterday = Self.calendar.date(byAdding: .day, value: -1, to: Self.now)!
        let lastWeek = Self.calendar.date(byAdding: .day, value: -3, to: Self.now)!
        let older = Self.calendar.date(byAdding: .day, value: -6 - 7, to: Self.now)!
        #expect(DayLabel.text(Self.now, now: Self.now, calendar: Self.calendar, locale: Self.locale) == "Today")
        #expect(DayLabel.text(yesterday, now: Self.now, calendar: Self.calendar, locale: Self.locale) == "Yesterday")
        #expect(DayLabel.text(lastWeek, now: Self.now, calendar: Self.calendar, locale: Self.locale) == "Thursday")
        #expect(DayLabel.text(older, now: Self.now, calendar: Self.calendar, locale: Self.locale) == "Oct 5")
        #expect(
            DayLabel.footer(created: older, edited: Self.now, now: Self.now, calendar: Self.calendar, locale: Self.locale)
                == "Created Oct 5 · Edited today"
        )
    }

    @Test("link domains drop www")
    func domains() {
        #expect(LinkLabel.domain("https://www.theperfectloaf.com/x") == "theperfectloaf.com")
        #expect(LinkLabel.domain("not a url") == nil)
    }

    @Test("masthead copy pluralises")
    func mastheadCopy() {
        #expect(MastheadCopy.todos(1) == "1 todo")
        #expect(MastheadCopy.todos(4) == "4 todos")
        #expect(MastheadCopy.lists(count: 2) == "2 lists · never age")
        #expect(MastheadCopy.today(count: 4, now: Self.now, locale: Self.locale) == "Sunday, October 18 · 4 todos")
    }
}
