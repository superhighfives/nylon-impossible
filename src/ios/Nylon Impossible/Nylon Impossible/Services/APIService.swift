//
//  APIService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation

enum APIError: Error, LocalizedError {
    case unauthorized
    case networkError(Error)
    case invalidResponse
    case serverError(Int, String?)
    case decodingError(Error)
    
    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Not authorized. Please sign in again."
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .invalidResponse:
            return "Invalid response from server"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message ?? "Unknown")"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        }
    }
}

// MARK: - API Models

struct APITodo: Codable {
    let id: String
    let userId: String
    let title: String
    let completed: Bool
    let position: String?
    let createdAt: Date
    let updatedAt: Date
}

struct SyncRequest: Codable {
    let lastSyncedAt: Date?
    let changes: [TodoChange]
}

struct TodoChange: Codable {
    let id: String
    let title: String?
    let completed: Bool?
    let position: String?
    let updatedAt: Date
    let deleted: Bool?
}

struct SyncResponse: Codable {
    let todos: [APITodo]
    let syncedAt: String
    let conflicts: [SyncConflict]
}

struct SyncConflict: Codable {
    let id: String
    let resolution: String
    let localUpdatedAt: Date
    let remoteUpdatedAt: Date
}

// MARK: - API Protocol

protocol APIProviding: Sendable {
    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse
}

// MARK: - API Service

actor APIService: APIProviding {
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
    
    // MARK: - CRUD (for direct operations if needed)
    
    func listTodos() async throws -> [APITodo] {
        return try await get(path: "/todos")
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
    
    private func buildRequest(path: String, method: String) async throws -> URLRequest {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        
        // Get auth token
        let token = try await MainActor.run {
            Task {
                try await authService.getToken()
            }
        }.value
        
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        return request
    }
    
    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw APIError.decodingError(error)
            }
        case 401:
            throw APIError.unauthorized
        default:
            let message = try? JSONDecoder().decode(ErrorResponse.self, from: data).error
            throw APIError.serverError(httpResponse.statusCode, message)
        }
    }
}

// MARK: - Helper Types

private struct EmptyResponse: Decodable {
    let success: Bool?
}

private struct ErrorResponse: Decodable {
    let error: String
}
