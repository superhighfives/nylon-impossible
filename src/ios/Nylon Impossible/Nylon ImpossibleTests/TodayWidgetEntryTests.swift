//
//  TodayWidgetEntryTests.swift
//  Nylon ImpossibleTests
//
//  The Today widget's timeline entry (rows and their meta lines) and how
//  many rows each family has room for.
//

import Foundation
import Testing
import WidgetKit
@testable import Nylon_Impossible

@Suite("Today widget entry")
struct TodayWidgetEntryTests {
    private func todo(_ title: String, due: Int? = nil, pinned: Bool = false, now: Date) -> TodoItem {
        let item = TodoItem(title: title, userId: "u", position: "a0")
        item.pinned = pinned
        item.dueDate = due.map { DueLabel.inDays($0, now: now) }
        return item
    }

    // MARK: - Building

    @Test("Each row carries the app's meta line")
    func rowsCarryMeta() throws {
        let now = Date()
        let entry = TodayEntry.make(from: [
            todo("Renew passport", due: -2, now: now),
            todo("Review PR", pinned: true, now: now),
            todo("Call Mum", now: now),
        ], now: now)
        guard case .todos(let rows, let total) = entry.content else {
            Issue.record("Expected todos")
            return
        }
        #expect(total == 3)
        #expect(rows.map(\.title) == ["Renew passport", "Review PR", "Call Mum"])
        #expect(rows[0].meta == [.due("2 days overdue", overdue: true)])
        #expect(rows[1].meta == [.pinned])
        #expect(rows[2].meta.isEmpty)
    }

    @Test("Carries at most maxRows, but counts them all")
    func capsRows() {
        let now = Date()
        // More than the cap on either platform (5 on iOS, 10 on the Mac).
        let count = TodayEntry.maxRows + 4
        let todos = (0..<count).map { todo("Todo \($0)", now: now) }
        guard case .todos(let rows, let total) = TodayEntry.make(from: todos, now: now).content else {
            Issue.record("Expected todos")
            return
        }
        #expect(rows.count == TodayEntry.maxRows)
        #expect(total == count)
    }

    @Test("An empty day is an empty list, not signed out")
    func emptyDay() {
        #expect(TodayEntry.make(from: []).content == .todos([], total: 0))
    }

    // MARK: - Fitting

    private func rows(_ metas: [Bool]) -> [WidgetTodo] {
        metas.map { WidgetTodo(id: UUID(), title: "Todo", meta: $0 ? [.pinned] : []) }
    }

    @Test("Rows with meta lines fit two, with room for \"+N more\"")
    func fitsTwoTallRows() {
        let todos = rows([true, true, true, true, true])
        #expect(TodayWidgetLayout.fit(todos, total: 5, budget: TodayWidgetLayout.budget(for: .systemSmall)) == 2)
    }

    @Test("Undated todos are shorter, so more of them fit")
    func fitsMoreShortRows() {
        let todos = rows([false, false, false, false, false])
        #expect(TodayWidgetLayout.fit(todos, total: 5, budget: TodayWidgetLayout.budget(for: .systemSmall)) == 3)
    }

    @Test("With nothing left over, no room is kept for \"+N more\"")
    func noReserveWhenAllFit() {
        let todos = rows([false, false, false, false])
        #expect(TodayWidgetLayout.fit(todos, total: 4, budget: TodayWidgetLayout.budget(for: .systemMedium)) == 4)
    }

    @Test("Always shows at least one row")
    func atLeastOne() {
        #expect(TodayWidgetLayout.fit(rows([true]), total: 10, budget: 10) == 1)
        #expect(TodayWidgetLayout.fit([], total: 0, budget: 100) == 0)
    }
}
