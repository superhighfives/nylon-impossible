//
//  BackgroundSyncService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/26/26.
//

import Foundation
import SwiftData

/// Lightweight, dependency-free sync service usable from App Intent extensions and BGTask contexts.
/// Performs one-way upload of unsynced items — does not apply remote changes to avoid write
/// conflicts with the main app process. Full bidirectional sync happens the next time the main
/// app is foregrounded and SyncService.sync() runs.
struct BackgroundSyncService {
    static let appGroupSuiteName = "group.com.superhighfives.Nylon-Impossible"
    static let authTokenKey = "currentAuthToken"
    static let authTokenExpiryKey = "currentAuthTokenExpiry"

    private let apiBaseURL: String
    private let authToken: String
    private let userId: String

    /// Returns nil if credentials are missing or expired.
    init?(sharedDefaults: UserDefaults) {
        guard
            let token = sharedDefaults.string(forKey: BackgroundSyncService.authTokenKey),
            let userId = sharedDefaults.string(forKey: "currentUserId"),
            let expiry = sharedDefaults.object(forKey: BackgroundSyncService.authTokenExpiryKey) as? Date,
            expiry > Date()
        else { return nil }

        self.apiBaseURL = Config.apiBaseURL.absoluteString
        self.authToken = token
        self.userId = userId
    }

    /// Upload all unsynced items for the current user to the server.
    /// Marks items as synced on a 2xx response.
    @MainActor
    func sync(modelContainer: ModelContainer) async throws {
        let context = ModelContext(modelContainer)

        // 1. Fetch unsynced items for userId
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && !$0.isSynced }
        )
        let unsyncedItems = try context.fetch(descriptor)

        guard !unsyncedItems.isEmpty else { return }

        let changes: [TodoChange] = unsyncedItems.map { todo in
            let pendingUrlChanges = todo.isDeleted || todo.pendingUrls.isEmpty
                ? nil
                : todo.pendingUrls.map { TodoUrlChange(url: $0) }
            return TodoChange(
                id: todo.id.uuidString.lowercased(),
                title: todo.isDeleted ? nil : todo.title,
                description: todo.isDeleted ? nil : todo.itemDescription,
                completed: todo.isDeleted ? nil : todo.isCompleted,
                position: todo.isDeleted ? nil : todo.position,
                dueDate: todo.isDeleted ? nil : todo.dueDate,
                priority: todo.isDeleted ? nil : todo.priority,
                updatedAt: todo.updatedAt,
                deleted: todo.isDeleted ? true : nil,
                urls: pendingUrlChanges
            )
        }

        // 2. POST to /todos/sync with Bearer token
        guard let url = URL(string: "\(apiBaseURL)/todos/sync") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(SyncRequest(lastSyncedAt: nil, changes: changes))

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.invalidResponse
        }

        // 3. Mark items isSynced = true on 2xx
        for item in unsyncedItems {
            item.isSynced = true
            item.pendingUrls = []
        }
        try context.save()
    }
}
