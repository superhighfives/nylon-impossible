//
//  APITodo.swift
//  Nylon Impossible
//
//  The todo shapes the server returns, and the decoder that reads them. Split
//  out of APIService.swift so the widget, which refreshes itself from
//  `GET /todos` (see `WidgetServerRefresh`), can decode the same types without
//  compiling the app's API client.
//

import Foundation

struct APITodo: Codable, Sendable {
    let id: String
    let userId: String
    let parentId: String?  // Parent todo id for subtasks; nil for top-level
    let listId: String?    // Which list (Today/This week/Someday/custom) this todo belongs to
    let title: String
    let notes: String?
    let completed: Bool
    let completedAt: Date?
    let position: String?
    let dueDate: Date?
    let recurrence: Recurrence?
    let pinned: Bool?
    // Legacy spelling of `pinned`. The API sends both during the Sticky → Pin
    // expand/contract; read it only as a fallback so a response from a server
    // that predates `pinned` still keeps pins.
    let sticky: Bool?
    let createdAt: Date
    let updatedAt: Date
    let urls: [APITodoUrl]?  // URLs included in sync response

    /// Whether the todo is pinned, preferring `pinned` over the legacy key.
    var isPinned: Bool { pinned ?? sticky ?? false }

    init(
        id: String, userId: String, parentId: String? = nil, listId: String? = nil, title: String,
        notes: String? = nil,
        completed: Bool, completedAt: Date? = nil, position: String? = nil,
        dueDate: Date? = nil,
        recurrence: Recurrence? = nil,
        pinned: Bool? = nil,
        createdAt: Date, updatedAt: Date,
        urls: [APITodoUrl]? = nil
    ) {
        self.id = id
        self.userId = userId
        self.parentId = parentId
        self.listId = listId
        self.title = title
        self.notes = notes
        self.completed = completed
        self.completedAt = completedAt
        self.position = position
        self.dueDate = dueDate
        self.recurrence = recurrence
        self.pinned = pinned
        self.sticky = nil
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.urls = urls
    }
}

/// Fetch status for URL metadata
enum FetchStatus: String, Codable, Sendable {
    case pending
    case fetched
    case failed
}

struct APITodoUrl: Codable, Sendable, Identifiable {
    let id: String
    let todoId: String
    let url: String
    let title: String?
    let description: String?
    let siteName: String?
    let favicon: String?
    let image: String?
    // Optional for backward-compatible decoding: absent in payloads from older
    // servers. Treated as true (show the preview) via `showsPreview`.
    let showPreview: Bool?
    let position: String
    let fetchStatus: FetchStatus
    let fetchedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    /// Whether to render the fetched preview; defaults to true when unset.
    var showsPreview: Bool { showPreview ?? true }

    init(
        id: String, todoId: String, url: String,
        title: String?, description: String?, siteName: String?, favicon: String?,
        image: String? = nil, showPreview: Bool? = nil, position: String,
        fetchStatus: FetchStatus, fetchedAt: Date?,
        createdAt: Date, updatedAt: Date
    ) {
        self.id = id
        self.todoId = todoId
        self.url = url
        self.title = title
        self.description = description
        self.siteName = siteName
        self.favicon = favicon
        self.image = image
        self.showPreview = showPreview
        self.position = position
        self.fetchStatus = fetchStatus
        self.fetchedAt = fetchedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension JSONDecoder {
    /// Dates as the API sends them: ISO 8601 with or without fractional
    /// seconds, or a unix timestamp in seconds or milliseconds.
    static var api: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()

            // Try ISO8601 with fractional seconds first, then without. Parse
            // styles, not a new `ISO8601DateFormatter` per date: building a
            // formatter for each of a todo's four or five dates made decoding
            // a full `GET /todos` take seconds (about 1.8s for 2,000 todos on
            // an M-series Mac), which a widget's timeline can't afford.
            if let dateString = try? container.decode(String.self) {
                if let date = try? Date(dateString, strategy: APIDateStyle.fractional) {
                    return date
                }
                if let date = try? Date(dateString, strategy: APIDateStyle.whole) {
                    return date
                }
            }

            // Try numeric timestamp (seconds or milliseconds)
            if let timestamp = try? container.decode(Double.self) {
                // D1 stores unix timestamps in seconds. Values below ~32B are seconds,
                // values above are likely milliseconds.
                if timestamp < 32_503_680_000 {
                    return Date(timeIntervalSince1970: timestamp)
                } else {
                    return Date(timeIntervalSince1970: timestamp / 1000)
                }
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date"
            )
        }
        return decoder
    }
}

private nonisolated enum APIDateStyle {
    static let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    static let whole = Date.ISO8601FormatStyle()
}
