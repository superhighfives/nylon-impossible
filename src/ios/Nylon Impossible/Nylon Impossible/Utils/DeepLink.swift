//
//  DeepLink.swift
//  Nylon Impossible
//
//  The app's one outside route: `nylon://add?list=today` opens the composer,
//  focused, on the named list. The Home Screen quick action, the widget's "+"
//  button, the Control Center / Lock Screen control and a typed URL all land
//  here, so each of them behaves exactly like the others.
//
//  Compiled into the widget extension too, so the widget can build the same
//  URL it asks the app to open.
//

import Foundation

enum DeepLink: Equatable, Sendable {
    /// Open the composer, focused, adding to `list`.
    case add(list: ListTarget)

    /// Which list a deep link names. The three time lists go by their kind
    /// rather than their id: ids are per account, and a widget or a URL
    /// someone typed has no way to know them.
    enum ListTarget: Equatable, Sendable {
        case today
        case thisWeek
        case someday
        /// One of your lists, by id.
        case list(String)

        /// The `list=` query value.
        var queryValue: String {
            switch self {
            case .today: return "today"
            case .thisWeek: return "this-week"
            case .someday: return "someday"
            case .list(let id): return id
            }
        }

        /// The system list this names, or nil for one of your lists.
        var systemKind: SystemListKind? {
            switch self {
            case .today: return .today
            case .thisWeek: return .thisWeek
            case .someday: return .someday
            case .list: return nil
            }
        }

        /// Parse a `list=` value. Missing or empty means Today. The time
        /// lists accept a few spellings ("this-week", "thisweek", "week"), so
        /// a hand-written Shortcut doesn't have to guess the right one;
        /// anything else is taken as a list id.
        init(queryValue: String?) {
            let value = (queryValue ?? "").trimmingCharacters(in: .whitespaces)
            switch value.lowercased() {
            case "", "today": self = .today
            case "this-week", "thisweek", "this_week", "week": self = .thisWeek
            case "someday": self = .someday
            default: self = .list(value)
            }
        }

        init(systemKind: SystemListKind) {
            switch systemKind {
            case .today: self = .today
            case .thisWeek: self = .thisWeek
            case .someday: self = .someday
            }
        }
    }

    static let scheme = "nylon"

    /// Parse a URL the app was opened with; nil for anything that isn't one
    /// of ours (Clerk's OAuth callbacks share the app's URL handling).
    init?(url: URL) {
        guard url.scheme?.lowercased() == Self.scheme else { return nil }
        // `nylon://add` puts "add" in the host; `nylon:add` and `nylon:///add`
        // put it in the path. Accept all three.
        let host = url.host?.lowercased() ?? ""
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
        let action = host.isEmpty ? path : host
        guard action == "add" || action == "new" else { return nil }

        let list = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name.lowercased() == "list" }?
            .value
        self = .add(list: ListTarget(queryValue: list))
    }

    /// The URL for this link, for the widget and the control to open.
    var url: URL {
        switch self {
        case .add(let list):
            var components = URLComponents()
            components.scheme = Self.scheme
            components.host = "add"
            components.queryItems = [URLQueryItem(name: "list", value: list.queryValue)]
            // Built from fixed parts and a percent-encoded query, so this
            // can't fail; the fallback only keeps the type non-optional.
            return components.url ?? URL(fileURLWithPath: "/")
        }
    }
}
