//
//  TodoMeta.swift
//  Nylon Impossible
//
//  The words a row's meta line and the composer's chips use for dates,
//  repeats and links. One place, so the row, the detail sheet, the composer's
//  "Due Fri" chip and the "Done · repeats Fri" toast always agree.
//

import Foundation

/// One piece of a row's meta line, in the order the spec lists them.
enum MetaPart: Hashable, Sendable {
    case pinned
    case due(String, overdue: Bool)
    case repeats(String)
    case subtasks(done: Int, total: Int)
    case notes
    /// The first link's domain, and how many more links there are:
    /// "visitlisboa.com +2".
    case link(String, more: Int = 0)
}

enum DueLabel {
    /// Calendar days from today to the due day; negative when overdue.
    static func daysUntil(_ dueDate: Date, now: Date = Date(), calendar: Calendar = .current) -> Int {
        let due = DueDay.localDate(dueDate, calendar: calendar)
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: due).day ?? 0
    }

    /// "Today", "Tomorrow", a short weekday within the week ("Fri"), "Oct 30"
    /// further out, or "3 days overdue".
    static func text(
        for dueDate: Date,
        now: Date = Date(),
        calendar: Calendar = .current,
        locale: Locale = .current
    ) -> (text: String, overdue: Bool) {
        let days = daysUntil(dueDate, now: now, calendar: calendar)
        if days < 0 {
            let late = -days
            return ("\(late) \(late == 1 ? "day" : "days") overdue", true)
        }
        if days == 0 { return ("Today", false) }
        if days == 1 { return ("Tomorrow", false) }

        let local = DueDay.localDate(dueDate, calendar: calendar)
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = locale
        formatter.timeZone = calendar.timeZone
        if days < 7 {
            formatter.setLocalizedDateFormatFromTemplate("EEE")
        } else if calendar.component(.year, from: local) == calendar.component(.year, from: now) {
            formatter.setLocalizedDateFormatFromTemplate("MMM d")
        } else {
            formatter.setLocalizedDateFormatFromTemplate("MMM d y")
        }
        return (formatter.string(from: local), false)
    }

    /// The composer's chip copy for a typed date: "Due Fri".
    static func chip(for dueDay: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        "Due \(text(for: dueDay, now: now, calendar: calendar).text)"
    }

    /// The next `weekday` (Sunday = 1, as `Calendar` counts) strictly after
    /// today, as a stored due day. Today's own weekday means a week out, the
    /// same rule the typed-date parser uses for "fri".
    static func upcoming(weekday: Int, now: Date = Date(), calendar: Calendar = .current) -> Date {
        let today = calendar.startOfDay(for: now)
        let current = calendar.component(.weekday, from: today)
        let ahead = (weekday - current + 7) % 7
        let day = calendar.date(byAdding: .day, value: ahead == 0 ? 7 : ahead, to: today) ?? today
        return DueDay.fromLocal(day, calendar: calendar)
    }

    /// The stored due day `days` after today.
    static func inDays(_ days: Int, now: Date = Date(), calendar: Calendar = .current) -> Date {
        let day = calendar.date(byAdding: .day, value: days, to: calendar.startOfDay(for: now)) ?? now
        return DueDay.fromLocal(day, calendar: calendar)
    }
}

/// Past days, for the Done history and the detail footer.
enum DayLabel {
    /// "Today", "Yesterday", a weekday within the last week ("Wednesday"),
    /// then "Oct 12".
    static func text(_ date: Date, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: date),
            to: calendar.startOfDay(for: now)
        ).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = locale
        formatter.timeZone = calendar.timeZone
        if days > 1 && days < 7 {
            formatter.setLocalizedDateFormatFromTemplate("EEEE")
        } else if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
            formatter.setLocalizedDateFormatFromTemplate("MMM d")
        } else {
            formatter.setLocalizedDateFormatFromTemplate("MMM d y")
        }
        return formatter.string(from: date)
    }

    /// "Created Oct 12 · Edited today".
    static func footer(created: Date, edited: Date, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
        func phrase(_ date: Date) -> String {
            let text = DayLabel.text(date, now: now, calendar: calendar, locale: locale)
            return text == "Today" || text == "Yesterday" ? text.lowercased() : text
        }
        return "Created \(phrase(created)) · Edited \(phrase(edited))"
    }
}

enum RepeatLabel {
    static func text(_ frequency: RecurrenceFrequency) -> String {
        switch frequency {
        case .daily: return "Daily"
        case .weekly: return "Weekly"
        case .monthly: return "Monthly"
        case .yearly: return "Yearly"
        }
    }
}

enum LinkLabel {
    /// "visitlisboa.com" for "https://www.visitlisboa.com/tram".
    static func domain(_ urlString: String) -> String? {
        guard let host = URL(string: urlString)?.host?.lowercased(), !host.isEmpty else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}

enum TodoMeta {
    /// The meta line for a top-level todo: only what's set, in spec order.
    static func parts(
        for todo: TodoItem,
        subtasks: [TodoItem],
        now: Date = Date(),
        calendar: Calendar = .current,
        locale: Locale = .current
    ) -> [MetaPart] {
        var parts: [MetaPart] = []
        if todo.pinned { parts.append(.pinned) }
        if let dueDate = todo.dueDate {
            let label = DueLabel.text(for: dueDate, now: now, calendar: calendar, locale: locale)
            parts.append(.due(label.text, overdue: label.overdue))
        }
        if let recurrence = todo.recurrence {
            parts.append(.repeats(RepeatLabel.text(recurrence.frequency)))
        }
        let live = subtasks.filter { !$0.isSoftDeleted }
        if !live.isEmpty {
            parts.append(.subtasks(done: live.filter(\.isCompleted).count, total: live.count))
        }
        if let notes = todo.itemNotes, !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(.notes)
        }
        let firstLink = todo.urls.sorted { $0.position < $1.position }.first?.url ?? todo.pendingUrls.first
        if let firstLink, let domain = LinkLabel.domain(firstLink) {
            let total = max(todo.urls.count, todo.pendingUrls.count)
            parts.append(.link(domain, more: max(total - 1, 0)))
        }
        return parts
    }

    /// A spoken version of the meta line for VoiceOver.
    static func accessibilityText(_ parts: [MetaPart]) -> String {
        parts.map { part -> String in
            switch part {
            case .pinned: return "Pinned"
            case .due(let text, let overdue): return overdue ? text : "Due \(text)"
            case .repeats(let text): return "Repeats \(text.lowercased())"
            case .subtasks(let done, let total): return "\(done) of \(total) subtasks done"
            case .notes: return "Has notes"
            case .link(let domain, let more):
                return more > 0 ? "Link to \(domain) and \(more) more" : "Link to \(domain)"
            }
        }
        .joined(separator: ", ")
    }
}
