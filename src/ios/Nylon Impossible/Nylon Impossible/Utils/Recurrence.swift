//
//  Recurrence.swift
//  Nylon Impossible
//
//  Swift port of the shared recurrence helper. Must produce the same result as
//  src/shared/src/recurrence.ts for the same inputs — covered by parity
//  fixtures shared between RecurrenceTests.swift and recurrence.test.ts.
//

import Foundation

enum RecurrenceHelper {
    /// Compute the next due date for a repeating todo. Advances `from` by the
    /// recurrence frequency repeatedly until the result is strictly greater
    /// than `now`.
    static func nextDueDate(_ recurrence: Recurrence, from: Date, now: Date) -> Date {
        var next = advance(recurrence, from: from)
        while next <= now {
            next = advance(recurrence, from: next)
        }
        return next
    }

    private static func advance(_ recurrence: Recurrence, from: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        // Use UTC so day-of-month / day-of-week math matches the TS port,
        // which operates on UTC fields.
        calendar.timeZone = TimeZone(identifier: "UTC")!

        switch recurrence.frequency {
        case .daily:
            return calendar.date(byAdding: .day, value: 1, to: from)!
        case .weekly:
            return calendar.date(byAdding: .day, value: 7, to: from)!
        case .monthly:
            return addMonths(1, to: from, calendar: calendar)
        case .yearly:
            return addMonths(12, to: from, calendar: calendar)
        }
    }

    // Adds `months` calendar months while clamping the day-of-month to the
    // target month's length (e.g. Jan 31 → Feb 28/29).
    private static func addMonths(_ months: Int, to from: Date, calendar: Calendar) -> Date {
        var components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: from
        )
        let day = components.day ?? 1
        let originalMonth = components.month ?? 1
        let originalYear = components.year ?? 1970

        let zeroBasedTarget = (originalMonth - 1) + months
        let targetYear = originalYear + Int((Double(zeroBasedTarget) / 12.0).rounded(.down))
        let normalizedMonth = ((zeroBasedTarget % 12) + 12) % 12 + 1

        components.year = targetYear
        components.month = normalizedMonth
        components.day = 1

        // Resolve the first of the target month, then clamp the day.
        let firstOfTargetMonth = calendar.date(from: components)!
        let range = calendar.range(of: .day, in: .month, for: firstOfTargetMonth)!
        components.day = min(day, range.count)
        return calendar.date(from: components)!
    }
}
