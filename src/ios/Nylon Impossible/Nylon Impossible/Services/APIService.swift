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

struct APITodo: Codable, Sendable {
    let id: String
    let userId: String
    let title: String
    let notes: String?
    let completed: Bool
    let position: String?
    let dueDate: Date?
    let priority: String?
    let aiStatus: AIStatus?
    let createdAt: Date
    let updatedAt: Date
    let urls: [APITodoUrl]?  // URLs included in sync response
    let research: APIResearch?

    init(
        id: String, userId: String, title: String, notes: String? = nil,
        completed: Bool, position: String? = nil, dueDate: Date? = nil,
        priority: String? = nil, aiStatus: AIStatus? = nil,
        createdAt: Date, updatedAt: Date,
        urls: [APITodoUrl]? = nil, research: APIResearch? = nil
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.notes = notes
        self.completed = completed
        self.position = position
        self.dueDate = dueDate
        self.priority = priority
        self.aiStatus = aiStatus
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.urls = urls
        self.research = research
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
    let position: String?
    let dueDate: Date?
    let priority: String?
    let aiStatus: AIStatus?
    let createdAt: Date
    let updatedAt: Date
    let urls: [APITodoUrl]
    let research: APIResearch?

    init(
        id: String, userId: String, title: String, notes: String? = nil,
        completed: Bool, position: String? = nil, dueDate: Date? = nil,
        priority: String? = nil, aiStatus: AIStatus? = nil,
        createdAt: Date, updatedAt: Date,
        urls: [APITodoUrl] = [], research: APIResearch? = nil
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.notes = notes
        self.completed = completed
        self.position = position
        self.dueDate = dueDate
        self.priority = priority
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
    let title: String?
    let notes: String?
    let completed: Bool?
    let position: String?
    let dueDate: Date?
    let priority: String?
    let updatedAt: Date
    let deleted: Bool?
    let urls: [TodoUrlChange]?
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
    let position: String?
    let dueDate: Date?
    let priority: String?
    let aiStatus: AIStatus?
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - User Models

struct APIUser: Codable, Sendable {
    let id: String
    let email: String
    let aiEnabled: Bool
    let location: String?
    let createdAt: Date
    let updatedAt: Date
}

struct UpdateUserRequest: Encodable, Sendable {
    let aiEnabled: Bool?
    // Double optional: nil = omit field, .some(nil) = send null, .some(value) = send value
    let location: String??

    enum CodingKeys: String, CodingKey {
        case aiEnabled, location
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let aiEnabled {
            try container.encode(aiEnabled, forKey: .aiEnabled)
        }
        if case .some(let loc) = location {
            try container.encode(loc, forKey: .location)
        }
    }
}

// MARK: - API Protocol

@MainActor
protocol APIProviding: Sendable {
    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse
    func smartCreate(text: String) async throws -> SmartCreateResponse
    func getMe() async throws -> APIUser
    func updateMe(_ request: UpdateUserRequest) async throws -> APIUser
    func reresearch(todoId: String) async throws
    func cancelResearch(todoId: String) async throws
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

    // MARK: - User Preferences

    func getMe() async throws -> APIUser {
        return try await get(path: "/users/me")
    }

    func updateMe(_ request: UpdateUserRequest) async throws -> APIUser {
        return try await patch(path: "/users/me", body: request)
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

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
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
