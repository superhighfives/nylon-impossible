//
//  ToastCopyTests.swift
//  Nylon ImpossibleTests
//
//  The "Added to …" toast's words, the same as the web composer's and
//  Gmail's (shared's `addedToast`, tested in api/test/unit/toast-copy.test.ts).
//

import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("ToastCopy")
struct ToastCopyTests {
    @Test("Names the list for one todo")
    func one() {
        #expect(ToastCopy.added(count: 1, listName: "someday") == "Added to someday")
        #expect(ToastCopy.added(count: 1, listName: "Groceries") == "Added to Groceries")
    }

    @Test("Counts several todos")
    func several() {
        #expect(ToastCopy.added(count: 3, listName: "someday") == "3 todos added to someday")
    }

    @Test("Adds the due day, lowercase where it's a relative day")
    func due() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        // A Monday.
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 10, day: 19, hour: 9)))
        func label(_ days: Int) -> String {
            DueLabel.text(for: DueLabel.inDays(days, now: now, calendar: calendar), now: now, calendar: calendar).text
        }
        #expect(ToastCopy.added(count: 1, listName: "today", dueLabel: label(0)) == "Added to today · due today")
        #expect(ToastCopy.added(count: 1, listName: "today", dueLabel: label(1)) == "Added to today · due tomorrow")
        #expect(ToastCopy.added(count: 1, listName: "this week", dueLabel: label(4)) == "Added to this week · due Fri")
        #expect(ToastCopy.added(count: 2, listName: "someday", dueLabel: "Mar 3") == "2 todos added to someday · due Mar 3")
    }

    @Test("Leaves the suffix off with no due day")
    func noDue() {
        #expect(ToastCopy.added(count: 1, listName: "today", dueLabel: nil) == "Added to today")
    }
}
