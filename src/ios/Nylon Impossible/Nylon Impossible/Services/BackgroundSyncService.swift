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
    static let backgroundSyncTaskIdentifier = "com.nylonimpossible.backgroundsync"

    private let apiBaseURL: URL
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

        self.apiBaseURL = Config.apiBaseURL
        self.authToken = token
        self.userId = userId
    }

    /// Upload all unsynced items for the current user to the server.
    /// Marks items as synced on a 2xx response.
    ///
    /// SwiftData fetch/save runs on the main actor; the HTTP request runs off-main
    /// to avoid blocking UI or risking watchdog termination.
    func sync(modelContainer: ModelContainer) async throws {
        // Capture as local so the closure can capture a plain String (Sendable)
        let userId = self.userId

        // 1. Fetch unsynced items and build the payload on the main actor
        let (changes, itemIDs): ([TodoChange], [PersistentIdentifier]) = try await MainActor.run {
            let context = ModelContext(modelContainer)
            let descriptor = FetchDescriptor<TodoItem>(
                predicate: #Predicate { $0.userId == userId && !$0.isSynced }
            )
            let unsyncedItems = try context.fetch(descriptor)
            let changeList = unsyncedItems.map { todo in
                let pendingUrlChanges = todo.isDeleted || todo.pendingUrls.isEmpty
                    ? nil
                    : todo.pendingUrls.map { TodoUrlChange(url: $0) }
                return TodoChange(
                    id: todo.id.uuidString.lowercased(),
                    title: todo.isDeleted ? nil : todo.title,
                    notes: todo.isDeleted ? nil : todo.itemNotes,
                    completed: todo.isDeleted ? nil : todo.isCompleted,
                    position: todo.isDeleted ? nil : todo.position,
                    dueDate: todo.isDeleted ? nil : todo.dueDate,
                    priority: todo.isDeleted ? nil : todo.priority,
                    updatedAt: todo.updatedAt,
                    deleted: todo.isDeleted ? true : nil,
                    urls: pendingUrlChanges
                )
            }
            return (changeList, unsyncedItems.map { $0.persistentModelID })
        }

        guard !changes.isEmpty else { return }

        // 2. POST to /todos/sync — runs off the main actor
        let url = apiBaseURL.appendingPathComponent("todos/sync")
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
            throw APIError.invalidResponse(url: request.url?.absoluteString ?? "unknown")
        }

        // 3. Mark items as synced on the main actor
        try await MainActor.run {
            let context = ModelContext(modelContainer)
            for id in itemIDs {
                if let item = context.model(for: id) as? TodoItem {
                    item.isSynced = true
                    item.pendingUrls = []
                }
            }
            try context.save()
        }
    }
}
