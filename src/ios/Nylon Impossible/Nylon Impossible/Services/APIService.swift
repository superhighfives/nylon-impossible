//
//  APIService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation
import Sentry

enum APIError: Error, LocalizedError {
    case unauthorized(url: String)
    case networkError(Error, url: String)
    case invalidResponse(url: String)
    case serverError(Int, String?, url: String)
    case decodingError(Error, url: String, statusCode: Int, responseBody: String)

    var errorDescription: String? {
        switch self {
        case .unauthorized(let url):
            return "Not authorized. Please sign in again. [URL: \(url)]"
        case .networkError(let error, let url):
            return "Network error: \(error.localizedDescription) [URL: \(url)]"
        case .invalidResponse(let url):
            return "Invalid response from server [URL: \(url)]"
        case .serverError(let code, let message, let url):
            return "Server error (\(code)): \(message ?? "Unknown") [URL: \(url)]"
        case .decodingError(let error, let url, let statusCode, let responseBody):
            return "Failed to decode response: \(error.localizedDescription) [URL: \(url), status: \(statusCode), body: \(responseBody)]"
        }
    }
}

// MARK: - API Models

struct APIResearch: Codable, Sendable {
    let id: String
    let status: String        // "pending" | "completed" | "failed"
    let researchType: String  // "general" | "location"
    let summary: String?
    let researchedAt: Date?
    let createdAt: Date
}

struct APITodoMessage: Codable, Sendable, Identifiable {
    let id: String
    let todoId: String
    let role: String         // "assistant" | "user"
    let content: String
    let createdAt: Date
    let awaitingReply: Bool
}

struct APITodo: Codable, Sendable {
    let id: String
    let userId: String
    let parentId: String?  // Parent todo id for subtasks; nil for top-level
    let title: String
    let notes: String?
    let completed: Bool
    let completedAt: Date?
    let position: String?
    let dueDate: Date?
    let priority: String?
    let recurrence: Recurrence?
    let aiStatus: AIStatus?
    let needsInput: Bool?
    let createdAt: Date
    let updatedAt: Date
    let urls: [APITodoUrl]?  // URLs included in sync response
    let research: APIResearch?
    let messages: [APITodoMessage]?  // Conversation included in sync response

    init(
        id: String, userId: String, parentId: String? = nil, title: String,
        notes: String? = nil,
        completed: Bool, completedAt: Date? = nil, position: String? = nil,
        dueDate: Date? = nil,
        priority: String? = nil, recurrence: Recurrence? = nil,
        aiStatus: AIStatus? = nil, needsInput: Bool? = nil,
        createdAt: Date, updatedAt: Date,
        urls: [APITodoUrl]? = nil, research: APIResearch? = nil,
        messages: [APITodoMessage]? = nil
    ) {
        self.id = id
        self.userId = userId
        self.parentId = parentId
        self.title = title
        self.notes = notes
        self.completed = completed
        self.completedAt = completedAt
        self.position = position
        self.dueDate = dueDate
        self.priority = priority
        self.recurrence = recurrence
        self.aiStatus = aiStatus
        self.needsInput = needsInput
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.urls = urls
        self.research = research
        self.messages = messages
    }
}

/// Fetch status for URL metadata
enum FetchStatus: String, Codable, Sendable {
    case pending
    case fetched
    case failed
}

/// AI processing status for todos
enum AIStatus: String, Codable, Sendable {
    case pending
    case processing
    case complete
    case failed
}

struct APITodoUrl: Codable, Sendable, Identifiable {
    let id: String
    let todoId: String
    let researchId: String?  // Non-nil when URL is a research citation source
    let url: String
    let title: String?
    let description: String?
    let siteName: String?
    let favicon: String?
    let image: String?
    let position: String
    let fetchStatus: FetchStatus
    let fetchedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    init(
        id: String, todoId: String, researchId: String? = nil, url: String,
        title: String?, description: String?, siteName: String?, favicon: String?,
        image: String? = nil, position: String, fetchStatus: FetchStatus, fetchedAt: Date?,
        createdAt: Date, updatedAt: Date
    ) {
        self.id = id
        self.todoId = todoId
        self.researchId = researchId
        self.url = url
        self.title = title
        self.description = description
        self.siteName = siteName
        self.favicon = favicon
        self.image = image
        self.position = position
        self.fetchStatus = fetchStatus
        self.fetchedAt = fetchedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

struct APITodoWithUrls: Codable, Sendable {
    let id: String
    let userId: String
    let title: String
    let notes: String?
    let completed: Bool
    let completedAt: Date?
    let position: String?
    let dueDate: Date?
    let priority: String?
    let recurrence: Recurrence?
    let aiStatus: AIStatus?
    let createdAt: Date
    let updatedAt: Date
    let urls: [APITodoUrl]
    let research: APIResearch?

    init(
        id: String, userId: String, title: String, notes: String? = nil,
        completed: Bool, completedAt: Date? = nil, position: String? = nil,
        dueDate: Date? = nil,
        priority: String? = nil, recurrence: Recurrence? = nil,
        aiStatus: AIStatus? = nil,
        createdAt: Date, updatedAt: Date,
        urls: [APITodoUrl] = [], research: APIResearch? = nil
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.notes = notes
        self.completed = completed
        self.completedAt = completedAt
        self.position = position
        self.dueDate = dueDate
        self.priority = priority
        self.recurrence = recurrence
        self.aiStatus = aiStatus
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.urls = urls
        self.research = research
    }
}

struct SyncRequest: Codable, Sendable {
    let lastSyncedAt: Date?
    let changes: [TodoChange]
}

struct TodoUrlChange: Codable, Sendable, Equatable {
    let url: String
}

struct TodoChange: Codable, Sendable {
    let id: String
    let parentId: String?  // Set on create for subtasks; server ignores on update
    let title: String?
    let notes: String?
    let completed: Bool?
    let position: String?
    let dueDate: Date?
    let priority: String?
    let recurrence: Recurrence?
    let completedAt: Date?
    let updatedAt: Date
    let deleted: Bool?
    let urls: [TodoUrlChange]?

    enum CodingKeys: String, CodingKey {
        case id, parentId, title, notes, completed, position, dueDate, priority,
             recurrence, completedAt, updatedAt, deleted, urls
    }

    // Custom encode so `completedAt` is sent explicitly — as JSON null when nil —
    // rather than omitted like the other optionals. The server distinguishes
    // "clear it" (null) from "leave alone" (absent), so undoing a completed
    // repeat (which nils completedAt locally) must reach the server as null.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(parentId, forKey: .parentId)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(notes, forKey: .notes)
        try c.encodeIfPresent(completed, forKey: .completed)
        try c.encodeIfPresent(position, forKey: .position)
        try c.encodeIfPresent(dueDate, forKey: .dueDate)
        try c.encodeIfPresent(priority, forKey: .priority)
        try c.encodeIfPresent(recurrence, forKey: .recurrence)
        // A delete carries no field updates, so only send completedAt for live
        // todos — otherwise a delete would spuriously null it.
        if deleted != true {
            try c.encode(completedAt, forKey: .completedAt)
        }
        try c.encode(updatedAt, forKey: .updatedAt)
        try c.encodeIfPresent(deleted, forKey: .deleted)
        try c.encodeIfPresent(urls, forKey: .urls)
    }
}

extension Array where Element == TodoChange {
    /// Create parent todos before subtasks so self-referential parentId inserts
    /// succeed when both were created offline before the next sync.
    func orderedForSync() -> [TodoChange] {
        enumerated()
            .sorted { lhs, rhs in
                let lhsRank = lhs.element.parentId == nil ? 0 : 1
                let rhsRank = rhs.element.parentId == nil ? 0 : 1
                return lhsRank == rhsRank ? lhs.offset < rhs.offset : lhsRank < rhsRank
            }
            .map(\.element)
    }
}

struct SyncResponse: Codable, Sendable {
    let todos: [APITodo]
    let syncedAt: String
    let conflicts: [SyncConflict]
}

struct SyncConflict: Codable, Sendable {
    let id: String
    let resolution: String
    let localUpdatedAt: Date
    let remoteUpdatedAt: Date
}

// MARK: - Smart Create Models

struct SmartCreateRequest: Codable, Sendable {
    let text: String
}

struct SmartCreateResponse: Codable, Sendable {
    let todos: [SmartCreateTodo]
    let ai: Bool
}

struct SmartCreateTodo: Codable, Sendable {
    let id: String
    let userId: String
    let title: String
    let notes: String?
    let completed: Bool
    let completedAt: Date?
    let position: String?
    let dueDate: Date?
    let priority: String?
    let recurrence: Recurrence?
    let aiStatus: AIStatus?
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - User Models

struct APIUser: Codable, Sendable {
    let id: String
    let email: String
    let aiEnabled: Bool
    // "free" | "pro". Optional so the client still decodes against an older API
    // that predates the field; treated as "free" when absent.
    let plan: String?
    let location: String?
    // "light" | "dark" | "system". Optional so the client still decodes against
    // an older API that predates the field; treated as "system" when absent.
    let theme: String?
    // Whether completed todos are hidden from the list. Optional so the client
    // still decodes against an older API that predates the field; false when absent.
    let hideCompleted: Bool?
    let createdAt: Date
    let updatedAt: Date
}

struct UpdateUserRequest: Encodable, Sendable {
    let aiEnabled: Bool?
    // Double optional: nil = omit field, .some(nil) = send null, .some(value) = send value
    let location: String??
    // Single optional (theme is never nulled): nil = omit, value = send. `var`
    // with a default keeps it in the memberwise init (a defaulted `let` would be
    // dropped from it), so existing aiEnabled/location call sites still compile.
    var theme: String? = nil
    // Single optional (never nulled): nil = omit, value = send. Defaulted `var`
    // for the same memberwise-init reason as `theme`.
    var hideCompleted: Bool? = nil

    enum CodingKeys: String, CodingKey {
        case aiEnabled, location, theme, hideCompleted
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let aiEnabled {
            try container.encode(aiEnabled, forKey: .aiEnabled)
        }
        if case .some(let loc) = location {
            try container.encode(loc, forKey: .location)
        }
        if let theme {
            try container.encode(theme, forKey: .theme)
        }
        if let hideCompleted {
            try container.encode(hideCompleted, forKey: .hideCompleted)
        }
    }
}

// MARK: - Import Models

/// Result of a Google Tasks import. Mirrors the API's JSON response.
struct GoogleTasksImportResponse: Codable, Sendable {
    let imported: Int
    let skipped: Int
    /// IDs of every todo created by this import.
    let importedIds: [String]
    /// The subset of imports carrying a due date — the only ones that can hold a
    /// repeat schedule, offered to the user in a post-import review step.
    let datedTodos: [ImportedDatedTodo]
}

struct ImportedDatedTodo: Codable, Sendable, Identifiable {
    let id: String
    let title: String
    let dueDate: Date
}

// MARK: - API Protocol

@MainActor
protocol APIProviding: Sendable {
    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse
    func smartCreate(text: String) async throws -> SmartCreateResponse
    func getMe() async throws -> APIUser
    func updateMe(_ request: UpdateUserRequest) async throws -> APIUser
    func importGoogleTasks() async throws -> GoogleTasksImportResponse
    func deleteMe() async throws
    func reresearch(todoId: String) async throws
    func cancelResearch(todoId: String) async throws
    func replyToTodo(todoId: String, content: String) async throws -> String
    func dismissQuestion(todoId: String) async throws
}

// MARK: - API Service

@MainActor
final class APIService: APIProviding {
    private let baseURL: URL
    private let authService: AuthService
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(authService: AuthService) {
        self.baseURL = Config.apiBaseURL
        self.authService = authService

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()

            // Try ISO8601 with fractional seconds first
            if let dateString = try? container.decode(String.self) {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = formatter.date(from: dateString) {
                    return date
                }
                // Try without fractional seconds
                formatter.formatOptions = [.withInternetDateTime]
                if let date = formatter.date(from: dateString) {
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

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Sync

    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse {
        let request = SyncRequest(lastSyncedAt: lastSyncedAt, changes: changes)
        return try await post(path: "/todos/sync", body: request)
    }

    // MARK: - Smart Create

    func smartCreate(text: String) async throws -> SmartCreateResponse {
        return try await post(path: "/todos/smart", body: SmartCreateRequest(text: text))
    }

    // MARK: - CRUD (for direct operations if needed)

    func listTodos() async throws -> [APITodo] {
        return try await get(path: "/todos")
    }

    func getTodo(id: UUID) async throws -> APITodoWithUrls {
        return try await get(path: "/todos/\(id.uuidString.lowercased())")
    }

    func createTodo(id: UUID, title: String) async throws -> APITodo {
        struct CreateRequest: Codable {
            let id: String
            let title: String
        }
        return try await post(path: "/todos", body: CreateRequest(id: id.uuidString, title: title))
    }

    func updateTodo(id: UUID, title: String?, completed: Bool?, updatedAt: Date) async throws -> APITodo {
        struct UpdateRequest: Codable {
            let title: String?
            let completed: Bool?
            let updatedAt: Date
        }
        return try await put(
            path: "/todos/\(id.uuidString)",
            body: UpdateRequest(title: title, completed: completed, updatedAt: updatedAt)
        )
    }

    func deleteTodo(id: UUID) async throws {
        let _: EmptyResponse = try await delete(path: "/todos/\(id.uuidString)")
    }

    // MARK: - Research

    func reresearch(todoId: String) async throws {
        struct ReresearchResponse: Decodable { let id: String }
        let _: ReresearchResponse = try await post(path: "/todos/\(todoId)/research", body: EmptyBody())
    }

    func cancelResearch(todoId: String) async throws {
        let _: EmptyResponse = try await delete(path: "/todos/\(todoId)/research")
    }

    // MARK: - Conversation

    /// Reply to the agent's clarifying question. Returns the server message id.
    func replyToTodo(todoId: String, content: String) async throws -> String {
        struct ReplyRequest: Codable { let content: String }
        struct ReplyResponse: Decodable { let id: String }
        let response: ReplyResponse = try await post(
            path: "/todos/\(todoId)/reply",
            body: ReplyRequest(content: content)
        )
        return response.id
    }

    /// Dismiss the agent's open question without answering.
    func dismissQuestion(todoId: String) async throws {
        let _: EmptyResponse = try await delete(path: "/todos/\(todoId)/question")
    }

    // MARK: - User Preferences

    func getMe() async throws -> APIUser {
        return try await get(path: "/users/me")
    }

    func updateMe(_ request: UpdateUserRequest) async throws -> APIUser {
        return try await patch(path: "/users/me", body: request)
    }

    /// Permanently delete the current user's account and all their data. The
    /// server also removes the Clerk user (`deleteClerk: true`), so the caller
    /// only needs to sign out and clear local data afterward.
    func deleteMe() async throws {
        let _: EmptyResponse = try await delete(path: "/users/me")
    }

    // MARK: - Import

    /// Import open tasks from the user's Google Tasks "My Tasks" list. The server
    /// reads the user's Google OAuth token from Clerk, so the client only needs a
    /// connected Google account that has granted the Tasks scope. Safe to re-run:
    /// already-imported tasks are skipped server-side.
    func importGoogleTasks() async throws -> GoogleTasksImportResponse {
        return try await post(path: "/todos/import/google-tasks", body: EmptyBody())
    }

    // MARK: - HTTP Methods

    private func get<T: Decodable>(path: String) async throws -> T {
        let request = try await buildRequest(path: path, method: "GET")
        return try await execute(request)
    }

    private func post<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = try await buildRequest(path: path, method: "POST")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func put<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = try await buildRequest(path: path, method: "PUT")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func delete<T: Decodable>(path: String) async throws -> T {
        let request = try await buildRequest(path: path, method: "DELETE")
        return try await execute(request)
    }

    private func patch<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = try await buildRequest(path: path, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func buildRequest(path: String, method: String) async throws -> URLRequest {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method

        let token = try await authService.getToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest, isRetry: Bool = false) async throws -> T {
        let url = request.url?.absoluteString ?? "unknown"
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            SentrySDK.capture(error: error) { scope in
                scope.setTag(value: "network", key: "area")
                scope.setExtra(value: url, key: "endpoint")
            }
            throw APIError.networkError(error, url: url)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse(url: url)
        }

        let statusCode = httpResponse.statusCode

        switch statusCode {
        case 200...299:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                let prefix = data.prefix(500)
                let body = String(data: prefix, encoding: .utf8) ?? "<non-UTF8 data, \(data.count) bytes>"
                SentrySDK.capture(error: error) { scope in
                    scope.setTag(value: "decoding", key: "area")
                    scope.setExtra(value: url, key: "endpoint")
                    scope.setExtra(value: statusCode, key: "statusCode")
                }
                throw APIError.decodingError(error, url: url, statusCode: statusCode, responseBody: body)
            }
        case 401:
            // On first 401, try to refresh the token and retry once. This avoids
            // a race condition where the Clerk JWT isn't fully ready right after
            // sign-in, which would otherwise immediately sign the user out.
            if !isRetry {
                let freshToken: String?
                do {
                    freshToken = try await authService.getToken()
                } catch is CancellationError {
                    // Let cancellation propagate — don't retry or sign out.
                    throw CancellationError()
                } catch {
                    // Token refresh failed for a non-cancellation reason; treat
                    // as an unrecoverable auth state and fall through to sign-out.
                    freshToken = nil
                }

                if let freshToken {
                    var retryRequest = request
                    retryRequest.setValue("Bearer \(freshToken)", forHTTPHeaderField: "Authorization")
                    return try await execute(retryRequest, isRetry: true)
                }
            }
            await authService.signOut()
            throw APIError.unauthorized(url: url)
        default:
            let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
            let apiError = APIError.serverError(statusCode, message, url: url)
            SentrySDK.capture(error: apiError) { scope in
                scope.setTag(value: "server", key: "area")
                scope.setExtra(value: statusCode, key: "statusCode")
            }
            throw apiError
        }
    }
}

// MARK: - Helper Types

private struct EmptyBody: Encodable {}

private struct EmptyResponse: Decodable {
    let success: Bool?
}

private struct ErrorResponse: Decodable {
    let error: String
}
