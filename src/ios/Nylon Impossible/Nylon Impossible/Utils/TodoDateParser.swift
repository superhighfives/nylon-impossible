//
//  TodoDateParser.swift
//  Nylon Impossible
//
//  Swift mirror of `parseTodoDate` in src/shared/src/todo-date.ts. Both are
//  tested against src/shared/src/todo-date-fixtures.json, so change them
//  together: same patterns, same rules, same answers.
//

import Foundation

/// Typed dates: "Pay rent tomorrow" → title "Pay rent", due tomorrow.
///
/// - "today", "tonight", "tomorrow" and "tmrw" count anywhere.
/// - Weekdays (optionally "on/by/due fri"), "next week" and month dates
///   ("oct 30", "30 oct") count only at the end of the text.
/// - A weekday equal to today means next week; "next week" is the Monday after
///   today; a month date already passed this year means next year.
/// - The title is never empty: if stripping the date would leave nothing,
///   nothing is parsed.
enum TodoDateParser {
    struct Result: Equatable {
        /// The title with the date words removed (or the trimmed input).
        let title: String
        /// Midnight UTC of the due calendar day (the stored form), or nil.
        let dueDay: Date?
        /// The matched words as typed, e.g. "on fri", for the "Due Fri ×" chip.
        let matched: String?
    }

    private static let weekdays: [String: Int] = [
        "sunday": 0, "sun": 0,
        "monday": 1, "mon": 1,
        "tuesday": 2, "tues": 2, "tue": 2,
        "wednesday": 3, "weds": 3, "wed": 3,
        "thursday": 4, "thurs": 4, "thur": 4, "thu": 4,
        "friday": 5, "fri": 5,
        "saturday": 6, "sat": 6
    ]

    private static let months: [String: Int] = [
        "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
        "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
        "august": 8, "aug": 8, "september": 9, "sept": 9, "sep": 9,
        "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12
    ]

    // Identical to TODO_DATE_PATTERNS in todo-date.ts.
    private static let weekdayAlt =
        "monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun"
    private static let monthAlt =
        "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec"
    private static let prefix = "(?:(?:on|by|due)\\s+)?"
    private static let ordinal = "(?:st|nd|rd|th)?"

    private static func regex(_ pattern: String) -> NSRegularExpression {
        // swiftlint:disable:next force_try
        try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    private static let weekdayRE = regex("(?:^|\\s)(\(prefix)(\(weekdayAlt)))\\s*$")
    private static let nextWeekRE = regex("(?:^|\\s)(\(prefix)next\\s+week)\\s*$")
    private static let monthDayRE = regex("(?:^|\\s)(\(prefix)(\(monthAlt))\\s+(\\d{1,2})\(ordinal))\\s*$")
    private static let dayMonthRE = regex("(?:^|\\s)(\(prefix)(\\d{1,2})\(ordinal)\\s+(\(monthAlt)))\\s*$")
    private static let relativeRE = regex("(?:^|\\s)((?:(?:by|due)\\s+)?(today|tonight|tomorrow|tmrw))(?![\\w'’-])")

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    static func parse(_ text: String, now: Date = Date(), timeZone: TimeZone = .autoupdatingCurrent) -> Result {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let none = Result(title: trimmed, dueDay: nil, matched: nil)
        guard !trimmed.isEmpty else { return none }

        let today = DueDay.today(now, in: timeZone)
        guard let (span, dueDay) = findCandidate(trimmed, today: today) else { return none }

        let before = String(trimmed[..<span.lowerBound]).trimmingTrailingWhitespace()
        let after = String(trimmed[span.upperBound...]).trimmingLeadingWhitespace()
        let joined: String
        if before.isEmpty {
            joined = after
        } else if after.isEmpty {
            joined = before
        } else if let first = after.first, ".,!?;:".contains(first) {
            joined = before + after
        } else {
            joined = before + " " + after
        }
        let title = joined.trimmingCharacters(in: .whitespacesAndNewlines)
        guard title.rangeOfCharacter(from: .alphanumerics) != nil else { return none }

        return Result(title: title, dueDay: dueDay, matched: String(trimmed[span]))
    }

    /// Convenience for a `timeZone` given as an IANA id; unknown ids fall back
    /// to UTC, matching the TS `dayKeyIn`.
    static func parse(_ text: String, now: Date, timeZoneIdentifier: String) -> Result {
        parse(text, now: now, timeZone: TimeZone(identifier: timeZoneIdentifier) ?? TimeZone(identifier: "UTC")!)
    }

    // MARK: - Internals

    private static func firstMatch(_ re: NSRegularExpression, in text: String) -> NSTextCheckingResult? {
        re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
    }

    private static func group(_ match: NSTextCheckingResult, _ index: Int, in text: String) -> String? {
        Range(match.range(at: index), in: text).map { String(text[$0]) }
    }

    private static func addDays(_ day: Date, _ days: Int) -> Date {
        day.addingTimeInterval(TimeInterval(days) * 86_400)
    }

    private static func validDay(year: Int, month: Int, day: Int) -> Date? {
        guard (1...31).contains(day) else { return nil }
        let components = DateComponents(year: year, month: month, day: day)
        guard let date = utcCalendar.date(from: components),
              utcCalendar.component(.month, from: date) == month else { return nil }
        return date
    }

    private static func findCandidate(_ text: String, today: Date) -> (Range<String.Index>, Date)? {
        // Sunday = 0, like JS getUTCDay.
        let todayWeekday = utcCalendar.component(.weekday, from: today) - 1

        if let match = firstMatch(weekdayRE, in: text),
           let span = Range(match.range(at: 1), in: text),
           let name = group(match, 2, in: text),
           let target = weekdays[name.lowercased()] {
            let ahead = (target - todayWeekday + 7) % 7
            return (span, addDays(today, ahead == 0 ? 7 : ahead))
        }

        if let match = firstMatch(nextWeekRE, in: text),
           let span = Range(match.range(at: 1), in: text) {
            let ahead = (1 - todayWeekday + 7) % 7
            return (span, addDays(today, ahead == 0 ? 7 : ahead))
        }

        let monthDay = firstMatch(monthDayRE, in: text)
        if let match = monthDay ?? firstMatch(dayMonthRE, in: text),
           let span = Range(match.range(at: 1), in: text),
           let monthName = group(match, monthDay != nil ? 2 : 3, in: text),
           let month = months[monthName.lowercased()],
           let dayText = group(match, monthDay != nil ? 3 : 2, in: text),
           let day = Int(dayText) {
            let year = utcCalendar.component(.year, from: today)
            var due = validDay(year: year, month: month, day: day)
            if due.map({ $0 < today }) ?? true {
                due = validDay(year: year + 1, month: month, day: day)
            }
            if let due { return (span, due) }
        }

        if let match = firstMatch(relativeRE, in: text),
           let span = Range(match.range(at: 1), in: text),
           let word = group(match, 2, in: text)?.lowercased() {
            let ahead = (word == "tomorrow" || word == "tmrw") ? 1 : 0
            return (span, addDays(today, ahead))
        }

        return nil
    }
}

private extension String {
    func trimmingTrailingWhitespace() -> String {
        var s = self
        while let last = s.last, last.isWhitespace { s.removeLast() }
        return s
    }

    func trimmingLeadingWhitespace() -> String {
        String(drop(while: { $0.isWhitespace }))
    }
}
