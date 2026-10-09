//
//  RemoteToday.swift
//  Nylon Widget
//
//  SPIKE: the Today digest built from the server instead of the local store,
//  so the widget stays current while the app sits closed. Any failure — no
//  Clerk session, no signal, a slow response — returns nil and the provider
//  falls back to the local store, which is exactly what it rendered before.
//

import Foundation
import os
import SwiftData

enum RemoteToday {
    static let log = Logger(subsystem: "com.superhighfives.Nylon-Impossible.Nylon-Widget", category: "RemoteToday")

    /// Whole-fetch budget: token plus two API calls. WidgetKit doesn't publish
    /// how long `getTimeline` may take, so stay well inside "a few seconds".
    static let deadline: Duration = .seconds(8)

    /// One row of the digest, from whichever side is newer: the server's copy,
    /// or a local edit that hasn't uploaded yet.
    struct Row: TodayDigestCandidate, Sendable {
        let id: UUID
        let title: String
        let userId: String?
        let isTopLevel: Bool
        let listKey: String?
        let dueDate: Date?
        let sticky: Bool
        let position: String
        let isEffectivelyCompleted: Bool
        let isRepeating: Bool
    }

    @MainActor
    static func digest(userId: String, now: Date = Date()) async -> [Row]? {
        let started = ContinuousClock.now
        do {
            let (todos, lists) = try await withDeadline(deadline) {
                let token = try await WidgetSessionToken.fetch()
                async let todos: [ServerTodo] = get("todos", token: token)
                async let lists: [ServerList] = get("lists", token: token)
                return try await (todos, lists)
            }
            let todayListId = lists.first { $0.systemKind == "today" }?.id.lowercased()
            let rows = overlayPendingLocalChanges(on: todos.compactMap(Row.init), userId: userId)
            let digest = TodayDigest.select(rows, userId: userId, todayListId: todayListId, now: now)
            let elapsed = String(describing: ContinuousClock.now - started)
            log.info("remote digest: \(digest.count) of \(todos.count) todos in \(elapsed, privacy: .public)")
            return digest
        } catch {
            let elapsed = String(describing: ContinuousClock.now - started)
            log.error("remote digest failed after \(elapsed, privacy: .public): \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    /// The server hasn't seen what's still waiting to upload — a completion
    /// tapped on this widget, a todo added from Siri or the share sheet — so
    /// the local store's unsynced rows win over the server's copy. Without
    /// this, ticking something off here would bring it straight back on the
    /// next remote refresh.
    @MainActor
    private static func overlayPendingLocalChanges(on remote: [Row], userId: String) -> [Row] {
        let context = ModelContext(SharedModelContainer.shared)
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.userId == userId && !$0.isSynced }
        )
        let pending = (try? context.fetch(descriptor)) ?? []
        guard !pending.isEmpty else { return remote }

        let pendingById = Dictionary(pending.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var rows = remote.compactMap { row -> Row? in
            guard let local = pendingById[row.id] else { return row }
            return local.isDeleted ? nil : Row(local)
        }
        let remoteIds = Set(remote.map(\.id))
        rows += pending.filter { !$0.isDeleted && !remoteIds.contains($0.id) }.map(Row.init)
        return rows
    }

    // MARK: - API

    fileprivate struct ServerTodo: Decodable, Sendable {
        let id: String
        let userId: String
        let parentId: String?
        let listId: String?
        let title: String
        let completed: Bool
        let completedAt: Date?
        let position: String?
        let dueDate: Date?
        let recurrence: Recurrence?
        let sticky: Bool?
    }

    fileprivate struct ServerList: Decodable, Sendable {
        let id: String
        let systemKind: String?
    }

    private static func get<T: Decodable>(_ path: String, token: String) async throws -> T {
        var request = URLRequest(url: Config.apiBaseURL.appendingPathComponent(path))
        request.timeoutInterval = 10
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(status) else { throw WidgetSessionToken.Failure.badResponse(status) }
        return try decoder.decode(T.self, from: data)
    }

    /// The API serialises dates with `toISOString()` — always fractional
    /// seconds.
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: string) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: string) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date: \(string)"))
        }
        return decoder
    }()

    private struct DeadlineExceeded: Error {}

    private static func withDeadline<T: Sendable>(
        _ limit: Duration,
        _ operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(for: limit)
                throw DeadlineExceeded()
            }
            defer { group.cancelAll() }
            guard let first = try await group.next() else { throw DeadlineExceeded() }
            return first
        }
    }
}

private extension RemoteToday.Row {
    init?(_ todo: RemoteToday.ServerTodo) {
        guard let id = UUID(uuidString: todo.id) else { return nil }
        self.init(
            id: id,
            title: todo.title,
            userId: todo.userId,
            isTopLevel: todo.parentId == nil,
            listKey: todo.listId,
            dueDate: todo.dueDate,
            sticky: todo.sticky ?? false,
            position: todo.position ?? "a0",
            // Same rule as `TodoItem.isEffectivelyCompleted`: a repeat ticked
            // off today stays out of the list until local midnight.
            isEffectivelyCompleted: todo.completed
                || todo.completedAt.map(Calendar.current.isDateInToday) == true,
            isRepeating: todo.recurrence != nil
        )
    }

    init(_ todo: TodoItem) {
        self.init(
            id: todo.id,
            title: todo.title,
            userId: todo.userId,
            isTopLevel: todo.isTopLevel,
            listKey: todo.listKey,
            dueDate: todo.dueDate,
            sticky: todo.sticky,
            position: todo.position,
            isEffectivelyCompleted: todo.isEffectivelyCompleted,
            isRepeating: todo.recurrence != nil
        )
    }
}
