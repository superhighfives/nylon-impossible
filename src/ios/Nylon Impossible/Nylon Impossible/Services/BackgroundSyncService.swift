//
//  BackgroundSyncService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/26/26.
//

import Foundation
import SwiftData

/// Lightweight sync service usable from App Intent extensions and BGTask contexts. It gets its
/// token from `SharedClerk`, which mints one in whichever process it runs in.
/// Performs one-way upload of unsynced items — does not apply remote changes to avoid write
/// conflicts with the main app process. Full bidirectional sync happens the next time the main
/// app is foregrounded and SyncService.sync() runs.
struct BackgroundSyncService {
    static let appGroupSuiteName = AppGroup.identifier
    /// Shared-defaults key for the signed-in Clerk user. Read by every target
    /// that touches the store without Clerk: the share extension, the Siri
    /// intent, the widget, and this service.
    static let userIdKey = "currentUserId"
    static let authTokenKey = "currentAuthToken"
    static let authTokenExpiryKey = "currentAuthTokenExpiry"
    static let backgroundSyncTaskIdentifier = "com.nylonimpossible.backgroundsync"

    private let apiBaseURL: URL
    private let userId: String

    /// Returns nil when no one is signed in. Reads the userId from shared
    /// UserDefaults; the token is fetched when there's something to upload.
    init?(sharedDefaults: UserDefaults) {
        guard let userId = sharedDefaults.string(forKey: BackgroundSyncService.userIdKey) else { return nil }

        self.apiBaseURL = Config.apiBaseURL
        self.userId = userId
    }

    /// A token for this upload: one minted now, or failing that the one the
    /// app last saved, if it hasn't expired. The saved one is only a fallback
    /// (the Mac widget, or Clerk failing to load), since a Clerk session
    /// token lasts 60 seconds.
    @MainActor
    static func currentToken(now: Date = Date()) async -> String? {
        if let fresh = await SharedClerk.freshToken() {
            return fresh
        }
        guard
            let token = KeychainHelper.loadString(forKey: authTokenKey),
            let expiry = KeychainHelper.loadDate(forKey: authTokenExpiryKey),
            expiry > now
        else { return nil }
        return token
    }

    /// When a JWT stops being accepted: its `exp` claim, less a margin for
    /// the request to arrive and for clock drift. Nil when it can't be read.
    static func expiry(ofJWT token: String, margin: TimeInterval = 10) -> Date? {
        guard let exp = claims(ofJWT: token)?["exp"] as? TimeInterval else { return nil }
        return Date(timeIntervalSince1970: exp - margin)
    }

    /// Who a JWT was issued to: its `sub` claim, which for a Clerk session
    /// token is the Clerk user id. Nil when it can't be read.
    static func subject(ofJWT token: String) -> String? {
        claims(ofJWT: token)?["sub"] as? String
    }

    /// A JWT's payload, decoded but not verified: fine for reading our own
    /// token's claims, never for trusting anyone else's.
    private static func claims(ofJWT token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var payload = parts[1]
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let data = Data(base64Encoded: payload) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
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
                let pendingUrlChanges = todo.isSoftDeleted || todo.pendingUrls.isEmpty
                    ? nil
                    : todo.pendingUrls.map { TodoUrlChange(url: $0) }
                return TodoChange(
                    id: todo.id.uuidString.lowercased(),
                    parentId: todo.isSoftDeleted ? nil : todo.parentId?.uuidString.lowercased(),
                    listId: todo.isSoftDeleted ? nil : todo.listKey?.lowercased(),
                    title: todo.isSoftDeleted ? nil : todo.title,
                    notes: todo.isSoftDeleted ? nil : todo.itemNotes,
                    completed: todo.isSoftDeleted ? nil : todo.isCompleted,
                    position: todo.isSoftDeleted ? nil : todo.position,
                    dueDate: todo.isSoftDeleted ? nil : todo.dueDate,
                    recurrence: todo.isSoftDeleted ? nil : todo.recurrence,
                    completedAt: todo.isSoftDeleted ? nil : todo.completedAt,
                    updatedAt: todo.updatedAt,
                    deleted: todo.isSoftDeleted ? true : nil,
                    pinned: todo.isSoftDeleted ? nil : todo.pinned,
                    urls: pendingUrlChanges
                )
            }
            .orderedForSync()
            return (changeList, unsyncedItems.map { $0.persistentModelID })
        }

        guard !changes.isEmpty else { return }

        let url = apiBaseURL.appendingPathComponent("todos/sync")
        guard let authToken = await Self.currentToken() else {
            throw APIError.unauthorized(url: url.absoluteString)
        }

        // 2. POST to /todos/sync — runs off the main actor
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(SyncRequest(lastSyncedAt: nil, changes: changes))

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse(url: url.absoluteString)
        }
        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized(url: url.absoluteString)
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.invalidResponse(url: url.absoluteString)
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
