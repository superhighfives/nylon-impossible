//
//  LastSweep.swift
//  Nylon Impossible
//
//  `GET /users/me` reports what the last overnight sweep moved:
//
//    "lastSweep": { "at": "2026-10-20T07:00:03.000Z",
//                   "movedToThisWeek": 2, "movedToSomeday": 1 }   // or null
//
//  Today shows one quiet line about it the morning after — "2 moved to This
//  Week, 1 to Someday overnight" — until it's dismissed or something is added
//  to Today. The rules for when it shows live in `OvernightNote`.
//

import Foundation

struct LastSweep: Codable, Equatable, Sendable {
    /// `at` exactly as the server sent it. The dismissal is keyed by this, so
    /// it never depends on a date round-tripping through a formatter.
    let atString: String
    let at: Date
    let movedToThisWeek: Int
    let movedToSomeday: Int

    init(at: Date, atString: String? = nil, movedToThisWeek: Int, movedToSomeday: Int) {
        self.at = at
        self.atString = atString ?? ISO8601DateFormatter().string(from: at)
        self.movedToThisWeek = movedToThisWeek
        self.movedToSomeday = movedToSomeday
    }

    enum CodingKeys: String, CodingKey {
        case at, movedToThisWeek, movedToSomeday
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let raw = try container.decode(String.self, forKey: .at)
        guard let date = Self.parse(raw) else {
            throw DecodingError.dataCorruptedError(
                forKey: .at, in: container, debugDescription: "lastSweep.at isn't ISO 8601: \(raw)"
            )
        }
        atString = raw
        at = date
        movedToThisWeek = try container.decodeIfPresent(Int.self, forKey: .movedToThisWeek) ?? 0
        movedToSomeday = try container.decodeIfPresent(Int.self, forKey: .movedToSomeday) ?? 0
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(atString, forKey: .at)
        try container.encode(movedToThisWeek, forKey: .movedToThisWeek)
        try container.encode(movedToSomeday, forKey: .movedToSomeday)
    }

    static func parse(_ raw: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
    }
}

extension APIUser {
    enum CodingKeys: String, CodingKey {
        case id, email, theme, timezone, timezoneAuto, lastSweep, createdAt, updatedAt
    }

    /// Written out so `lastSweep` can never fail the whole user: an older
    /// server leaves it out, and a malformed one reads as no sweep rather than
    /// losing the theme and timezone along with it.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decode(String.self, forKey: .id),
            email: try container.decode(String.self, forKey: .email),
            theme: try container.decodeIfPresent(String.self, forKey: .theme),
            timezone: try container.decodeIfPresent(String.self, forKey: .timezone),
            timezoneAuto: try container.decodeIfPresent(Bool.self, forKey: .timezoneAuto),
            lastSweep: (try? container.decodeIfPresent(LastSweep.self, forKey: .lastSweep)) ?? nil,
            createdAt: try container.decode(Date.self, forKey: .createdAt),
            updatedAt: try container.decode(Date.self, forKey: .updatedAt)
        )
    }
}

/// When and how Today mentions the overnight sweep.
enum OvernightNote {
    /// "2 moved to This Week overnight", "2 moved to This Week, 1 to Someday
    /// overnight", "1 moved to Someday overnight"; nil when nothing moved.
    static func text(movedToThisWeek week: Int, movedToSomeday someday: Int) -> String? {
        switch (week > 0, someday > 0) {
        case (true, true): return "\(week) moved to This Week, \(someday) to Someday overnight"
        case (true, false): return "\(week) moved to This Week overnight"
        case (false, true): return "\(someday) moved to Someday overnight"
        case (false, false): return nil
        }
    }

    /// Whether the sweep ran on the user's current local day, in the zone the
    /// sweep itself uses (their timezone setting, which may not be the
    /// device's).
    static func isToday(_ at: Date, now: Date = Date(), timeZone: TimeZone) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.isDate(at, inSameDayAs: now)
    }

    /// The line to show on Today, or nil.
    static func visibleText(
        _ sweep: LastSweep?,
        now: Date = Date(),
        timeZone: TimeZone,
        dismissedAt: String?
    ) -> String? {
        guard let sweep,
              sweep.atString != dismissedAt,
              isToday(sweep.at, now: now, timeZone: timeZone) else { return nil }
        return text(movedToThisWeek: sweep.movedToThisWeek, movedToSomeday: sweep.movedToSomeday)
    }

    /// The account's zone, falling back to the device's for an unknown name.
    static func timeZone(named identifier: String) -> TimeZone {
        TimeZone(identifier: identifier) ?? .autoupdatingCurrent
    }
}

/// The dismissed sweep, remembered by its `at`. One value is enough: the next
/// sweep has a different `at`, so it shows again on its own.
struct OvernightDismissal {
    static let key = "overnightNote.dismissedAt"

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var dismissedAt: String? { defaults.string(forKey: Self.key) }

    func dismiss(_ sweep: LastSweep) {
        defaults.set(sweep.atString, forKey: Self.key)
    }

    func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}
