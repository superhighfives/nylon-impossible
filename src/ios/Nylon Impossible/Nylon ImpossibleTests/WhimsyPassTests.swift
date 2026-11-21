//
//  WhimsyPassTests.swift
//  Nylon ImpossibleTests
//
//  #694, #784: which meta parts a row sets on a chip (only due today).
//

import Foundation
import Testing
@testable import Nylon_Impossible

@MainActor
@Suite("Meta chips")
struct MetaChipTests {
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.locale = Locale(identifier: "en_US_POSIX")
        return calendar
    }()
    private static let locale = Locale(identifier: "en_US_POSIX")
    /// Sunday, October 18 2026, midday UTC.
    private static let now = Date(timeIntervalSince1970: 1_792_324_800)

    private func due(_ offset: Int) -> MetaPart? {
        let todo = TodoItem(title: "Todo")
        todo.dueDate = DueLabel.inDays(offset, now: Self.now, calendar: Self.calendar)
        return TodoMeta.parts(for: todo, subtasks: [], now: Self.now, calendar: Self.calendar, locale: Self.locale).first
    }

    @Test("due today is the brand chip")
    func dueToday() {
        #expect(MetaPart.due("Today", overdue: false, today: true).chip == .brand)
    }

    @Test("other due days, pinned and repeat are plain text (#784)")
    func notChips() {
        #expect(MetaPart.due("Tomorrow", overdue: false).chip == nil)
        #expect(MetaPart.due("Fri", overdue: false).chip == nil)
        #expect(MetaPart.due("Oct 30", overdue: false).chip == nil)
        #expect(MetaPart.pinned.chip == nil)
        #expect(MetaPart.repeats("Weekly").chip == nil)
    }

    @Test("overdue, subtasks, notes and links stay plain")
    func plain() {
        #expect(MetaPart.due("3 days overdue", overdue: true).chip == nil)
        #expect(MetaPart.subtasks(done: 1, total: 4).chip == nil)
        #expect(MetaPart.notes(words: 2).chip == nil)
        #expect(MetaPart.link("visitlisboa.com", more: 2).chip == nil)
    }

    @Test("TodoMeta marks only a todo due today as today")
    func partsMarkToday() {
        #expect(due(0) == .due("Today", overdue: false, today: true))
        #expect(due(1) == .due("Tomorrow", overdue: false, today: false))
        #expect(due(5) == .due("Fri", overdue: false, today: false))
        #expect(due(12) == .due("Oct 30", overdue: false, today: false))
        #expect(due(-1) == .due("1 day overdue", overdue: true, today: false))
        #expect(due(0)?.chip == .brand)
        #expect(due(1)?.chip == nil)
        #expect(due(-1)?.chip == nil)
    }

    @Test("VoiceOver still hears due today as Due Today")
    func spoken() {
        #expect(TodoMeta.accessibilityText([.due("Today", overdue: false, today: true)]) == "Due Today")
    }
}
