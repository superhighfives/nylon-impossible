//
//  APIService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation
import Sentry

// MARK: - API Models

// `APITodo`, `APITodoUrl` and `FetchStatus` live in Models/APITodo.swift,
// which the widget compiles too.

struct APITodoWithUrls: Codable, Sendable {
    let id: String
    let userId: String
    let title: String
    let notes: String?
    let completed: Bool
    let completedAt: Date?
    let position: String?
    let dueDate: Date?
    let recurrence: Recurrence?
    let createdAt: Date
    let updatedAt: Date
    let urls: [APITodoUrl]

    init(
        id: String, userId: String, title: String, notes: String? = nil,
        completed: Bool, completedAt: Date? = nil, position: String? = nil,
        dueDate: Date? = nil,
        recurrence: Recurrence? = nil,
        createdAt: Date, updatedAt: Date,
        urls: [APITodoUrl] = []
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.notes = notes
        self.completed = completed
        self.completedAt = completedAt
        self.position = position
        self.dueDate = dueDate
        self.recurrence = recurrence
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.urls = urls
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

// MARK: - User Models

struct APIUser: Codable, Sendable {
    let id: String
    let email: String
    // "light" | "dark" | "system". Optional so the client still decodes against
    // an older API that predates the field; treated as "system" when absent.
    let theme: String?
    // IANA zone the aging sweep uses for "local midnight", and whether it
    // follows the device. Optional for the same older-API reason as `theme`;
    // a missing `timezoneAuto` means automatic.
    let timezone: String?
    let timezoneAuto: Bool?
    // What the last overnight sweep moved. Decoded leniently; see LastSweep.swift.
    let lastSweep: LastSweep?
    // Whether the account has the admin role, which shows the feedback
    // button. Optional for an older API; absent means no.
    let isAdmin: Bool?
    let createdAt: Date
    let updatedAt: Date

    init(
        id: String,
        email: String,
        theme: String?,
        timezone: String? = nil,
        timezoneAuto: Bool? = nil,
        lastSweep: LastSweep? = nil,
        isAdmin: Bool? = nil,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.email = email
        self.theme = theme
        self.timezone = timezone
        self.timezoneAuto = timezoneAuto
        self.lastSweep = lastSweep
        self.isAdmin = isAdmin
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

struct UpdateUserRequest: Encodable, Sendable {
    // Never nulled: nil = omit, value = send.
    var theme: String?
    var timezone: String?
    var timezoneAuto: Bool?

    enum CodingKeys: String, CodingKey {
        case theme, timezone, timezoneAuto
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(theme, forKey: .theme)
        try container.encodeIfPresent(timezone, forKey: .timezone)
        try container.encodeIfPresent(timezoneAuto, forKey: .timezoneAuto)
    }
}

// MARK: - API Protocol

@MainActor
protocol APIProviding: Sendable {
    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse
    func getMe() async throws -> APIUser
    func updateMe(_ request: UpdateUserRequest) async throws -> APIUser
    func deleteMe() async throws
    func processTodo(todoId: String) async throws -> Int
    func submitFeedback(_ request: FeedbackRequest) async throws -> FeedbackResult

    // MARK: - Lists
    func listLists() async throws -> [APIList]
    func createList(name: String, position: String?) async throws -> APIList
    func updateList(id: String, name: String?, position: String?) async throws -> APIList
    func deleteList(id: String) async throws -> Int
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

        self.decoder = .api

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Sync

    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse {
        let request = SyncRequest(lastSyncedAt: lastSyncedAt, changes: changes)
        return try await post(path: "/todos/sync", body: request)
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

    // MARK: - Process

    /// Re-run link processing for a todo: attach any URLs in its text, fetch
    /// what's behind them, and replace a "Check {domain}" placeholder title with
    /// what actually turned up.
    ///
    /// Deliberately not an AI action — no model runs and it works with AI turned
    /// off. Returns how many links were queued, so the caller can say "nothing
    /// to process" rather than leave the button looking inert.
    func processTodo(todoId: String) async throws -> Int {
        struct ProcessResponse: Decodable { let status: String; let links: Int }
        let response: ProcessResponse = try await post(
            path: "/todos/\(todoId)/process",
            body: EmptyBody()
        )
        return response.links
    }

    // MARK: - Links

    /// Show a link as its fetched preview, or as the bare URL.
    func updateTodoUrl(todoId: String, urlId: String, showPreview: Bool) async throws {
        struct UpdateUrlRequest: Encodable { let showPreview: Bool }
        let _: EmptyResponse = try await patch(
            path: "/todos/\(todoId)/urls/\(urlId)",
            body: UpdateUrlRequest(showPreview: showPreview)
        )
    }

    /// Remove a link from a todo.
    func deleteTodoUrl(todoId: String, urlId: String) async throws {
        let _: EmptyResponse = try await delete(path: "/todos/\(todoId)/urls/\(urlId)")
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

    // MARK: - Feedback

    /// File an issue in the private feedback repo. Admin only; the server
    /// answers 403 to anyone else.
    func submitFeedback(_ request: FeedbackRequest) async throws -> FeedbackResult {
        try await post(path: "/feedback", body: request)
    }

    // MARK: - Lists

    func listLists() async throws -> [APIList] {
        return try await get(path: "/lists")
    }

    func createList(name: String, position: String? = nil) async throws -> APIList {
        struct CreateListRequest: Encodable { let name: String; let position: String? }
        return try await post(path: "/lists", body: CreateListRequest(name: name, position: position))
    }

    func updateList(id: String, name: String? = nil, position: String? = nil) async throws -> APIList {
        struct UpdateListRequest: Encodable { let name: String?; let position: String? }
        return try await patch(path: "/lists/\(id)", body: UpdateListRequest(name: name, position: position))
    }

    /// Delete a custom list. Cascade-deletes its todos server-side; returns
    /// the number deleted so the caller can confirm/inform after the fact.
    func deleteList(id: String) async throws -> Int {
        struct DeleteListResponse: Decodable { let success: Bool; let deletedTodoCount: Int }
        let response: DeleteListResponse = try await delete(path: "/lists/\(id)")
        return response.deletedTodoCount
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
            // Transient connectivity failures (timeouts, offline, dropped/cancelled
            // requests) are expected on mobile and only add noise, so don't report them.
            if !APIError.isTransientNetworkError(error) {
                SentrySDK.capture(error: error) { scope in
                    scope.setTag(value: "network", key: "area")
                    scope.setExtra(value: url, key: "endpoint")
                }
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
