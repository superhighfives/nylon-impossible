//
//  Recurrence.swift
//  Nylon Impossible
//
//  Swift port of the shared recurrence helper. Must produce the same result as
//  src/shared/src/recurrence.ts for the same inputs — covered by parity
//  fixtures shared between RecurrenceTests.swift and recurrence.test.ts.
//

import Foundation

/// Due dates are calendar days, not instants. The canonical stored form is
/// midnight UTC of the picked day (what the web calendar writes and what the
/// API normalizes to). Older builds of this app wrote local midnight instead;
/// rounding to the *nearest* UTC midnight recovers the intended day from either
/// form for any offset within ±12h. Mirrors src/shared/src/due-date.ts.
///
/// Never format or compare a raw `dueDate` in the device's zone — go through
/// `localDate(_:)` (display / local comparisons) or `fromLocal(_:)` (writes).
enum DueDay {
    private static let secondsPerDay: TimeInterval = 86_400

    static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    /// The nearest UTC midnight — the canonical stored form of a due date.
    static func normalize(_ date: Date) -> Date {
        let days = (date.timeIntervalSince1970 / secondsPerDay).rounded()
        return Date(timeIntervalSince1970: days * secondsPerDay)
    }

    /// Local midnight of the due date's calendar day, for formatting with the
    /// device's calendar and comparing against local "today".
    static func localDate(_ dueDate: Date, calendar: Calendar = .current) -> Date {
        let day = utcCalendar.dateComponents([.year, .month, .day], from: normalize(dueDate))
        return calendar.date(from: day) ?? dueDate
    }

    /// The UTC-midnight due date for the calendar day `date` falls on locally
    /// (e.g. a value picked in a DatePicker).
    static func fromLocal(_ date: Date, calendar: Calendar = .current) -> Date {
        let day = calendar.dateComponents([.year, .month, .day], from: date)
        return utcCalendar.date(from: day) ?? normalize(date)
    }

    /// True when the due date's day is before today on the device.
    static func isOverdue(_ dueDate: Date, now: Date = Date(), calendar: Calendar = .current) -> Bool {
        localDate(dueDate, calendar: calendar) < calendar.startOfDay(for: now)
    }

    /// Today's calendar day in `timeZone`, as a UTC-midnight date (comparable
    /// with `normalize(_:)`).
    static func today(_ now: Date, in timeZone: TimeZone) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return fromLocal(now, calendar: calendar)
    }
}

/// Which built-in time-bucket list a due date's distance from `now` maps to.
enum ListPlacement: String {
    case today
    case thisWeek
    case sometime
}

enum RecurrenceHelper {
    /// Placement heuristic for a recurring todo's new occurrence: due today or
    /// tomorrow → Today; due within the next 7 days → This Week; further out →
    /// Sometime. Applied once when a new occurrence is created (initial
    /// creation of any recurring todo, or a repeat's dueDate advancing on
    /// completion) — the occurrence ages normally afterward. Mirrors
    /// `placementForDueDate` in src/shared/src/recurrence.ts.
    static func placement(
        forDueDate dueDate: Date,
        now: Date,
        timeZone: TimeZone = TimeZone(identifier: "UTC")!
    ) -> ListPlacement {
        let today = DueDay.today(now, in: timeZone)
        let due = DueDay.normalize(dueDate)
        let daysUntilDue = DueDay.utcCalendar.dateComponents([.day], from: today, to: due).day ?? 0

        if daysUntilDue <= 1 { return .today }
        if daysUntilDue <= 7 { return .thisWeek }
        return .sometime
    }

    /// Compute the next due date for a repeating todo: the first occurrence on
    /// a calendar day after today, where "today" is `now` in `timeZone`.
    /// Compares calendar days, not instants, so completing a daily repeat in
    /// the evening west of UTC doesn't skip tomorrow. Mirrors `nextDueDate` in
    /// src/shared/src/recurrence.ts.
    static func nextDueDate(
        _ recurrence: Recurrence,
        from: Date,
        now: Date,
        timeZone: TimeZone = TimeZone(identifier: "UTC")!
    ) -> Date {
        let today = DueDay.today(now, in: timeZone)
        var next = advance(recurrence, from: from)
        while DueDay.normalize(next) <= today {
            next = advance(recurrence, from: next)
        }
        return next
    }

    /// Step a recurrence one occurrence backward from `from`. Used to undo a
    /// repeat that was completed today (completing advances the dueDate, so
    /// un-checking before local midnight rolls it back). Mirrors
    /// `previousDueDate` in src/shared/src/recurrence.ts. Monthly/yearly clamp
    /// is lossy in reverse, matching the forward advance.
    static func previousDueDate(_ recurrence: Recurrence, from: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!

        switch recurrence.frequency {
        case .daily:
            return calendar.date(byAdding: .day, value: -1, to: from)!
        case .weekly:
            return calendar.date(byAdding: .day, value: -7, to: from)!
        case .monthly:
            return addMonths(-1, to: from, calendar: calendar)
        case .yearly:
            return addMonths(-12, to: from, calendar: calendar)
        }
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
