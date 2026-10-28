//
//  WidgetServerRefresh.swift
//  Nylon Impossible
//
//  The iOS Today widget's own pull from the server, so an edit made on the
//  web reaches the Home Screen without the app being opened. Each timeline
//  reload fetches `GET /todos` and `GET /lists` and folds them into the
//  shared store, then the widget renders from the store exactly as before.
//
//  Writing to the store (rather than merging in memory for display) is what
//  lets `CompleteTodoIntent` act on a row that arrived this way, and it means
//  a completion builds on the server's current title and list: the sync
//  endpoint is whole-row last-write-wins, so completing a stale local copy
//  would upload its stale fields over the web edit. The write is deliberately
//  narrower than `SyncService.applySync`:
//
//  - A local row with a pending change (`!isSynced`) is never touched. It
//    hasn't been uploaded yet, so the server copy is the older one.
//  - Rows the server no longer has are soft-deleted, not deleted. The app can
//    be suspended holding those objects in its own context, and a hard delete
//    from another process would leave it faulting on rows that are gone.
//    Its next sync removes them for real (`applySync` step 4).
//  - Lists are inserted and updated, never removed, for the same reason.
//
//  Compiled into the app (for the tests) and the widget. Only the iOS widget
//  calls `refresh`; the Mac widget can't mint a token (see `SharedClerk`) and
//  the running Mac app keeps the store current anyway.
//

import Foundation
import SwiftData
import os

enum WidgetServerRefresh {
    private static let logger = Logger(subsystem: "com.superhighfives.Nylon-Impossible", category: "WidgetServerRefresh")

    /// How long the whole fetch (token and both requests) may take before
    /// the widget gives up and renders the store as it stands.
    static let deadline: Duration = .seconds(8)

    /// How often the iOS widget asks for a new timeline, at most. WidgetKit
    /// may stretch it; it won't shorten it.
    static let interval: TimeInterval = 30 * 60

    /// What the server returned for the signed-in user.
    struct Snapshot: Sendable {
        let todos: [APITodo]
        let lists: [APIList]
    }

    /// When the next timeline should be requested: in half an hour, or at
    /// local midnight if that comes first (the day's digest changes then even
    /// when nothing else does).
    static func nextReload(after now: Date) -> Date {
        min(now.addingTimeInterval(interval), TodayDigest.startOfTomorrow(after: now))
    }

    /// Fetch and merge. False on any failure, which leaves the store as it
    /// was, so the widget shows exactly what it would have without this.
    @discardableResult
    static func refresh(userId: String, container: ModelContainer) async -> Bool {
        guard let snapshot = await withDeadline(deadline, operation: { await download(userId: userId) }) else {
            return false
        }
        do {
            try merge(snapshot, userId: userId, into: ModelContext(container))
            return true
        } catch {
            logger.error("Couldn't merge server todos: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    // MARK: - Merge

    /// Fold the server's rows into the store. See the file header for the
    /// rules; `TodoItem.apply(remote:)` is the field copy `SyncService` uses.
    ///
    /// "Absent from the snapshot means deleted" is only safe while `GET /todos`
    /// returns every todo for the user. If it gains a limit or filter, this will
    /// soft-delete live rows.
    static func merge(_ snapshot: Snapshot, userId: String, into context: ModelContext) throws {
        let locals = try context.fetch(FetchDescriptor<TodoItem>())
        let localById = Dictionary(locals.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        var remoteIds = Set<UUID>()
        for remote in snapshot.todos {
            guard let id = UUID(uuidString: remote.id) else { continue }
            remoteIds.insert(id)

            guard let local = localById[id] else {
                context.insert(TodoItem(remote: remote, id: id, userId: userId))
                continue
            }
            // A pending local change wins: it's newer than anything the server
            // has seen. That includes a pending delete.
            guard local.isSynced, !local.isSoftDeleted else { continue }
            if remote.updatedAt > local.updatedAt {
                local.apply(remote: remote)
            }
        }

        for local in locals
        where local.userId == userId && local.isSynced && !local.isSoftDeleted && !remoteIds.contains(local.id) {
            local.isSoftDeleted = true
        }

        let localLists = try context.fetch(FetchDescriptor<TodoListModel>(
            predicate: #Predicate { $0.userId == userId }
        ))
        let listById = Dictionary(localLists.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for remote in snapshot.lists where remote.userId == userId {
            if let existing = listById[remote.id] {
                existing.name = remote.name
                existing.kind = remote.kind
                existing.systemKindRaw = remote.systemKind
                existing.position = remote.position
                existing.updatedAt = remote.updatedAt
                existing.isSynced = true
            } else {
                context.insert(TodoListModel(from: remote))
            }
        }

        if context.hasChanges {
            try context.save()
        }
    }

    // MARK: - Fetch

    /// Nil on any failure: no session, a token for somebody else, a non-2xx,
    /// or a body that won't decode.
    private static func download(userId: String) async -> Snapshot? {
        guard let token = await SharedClerk.freshToken() else {
            logger.info("No session token; showing the local store")
            return nil
        }
        // The shared defaults name the account the store belongs to. A token
        // for anyone else (mid account switch) would make every local row
        // look deleted on the server.
        guard BackgroundSyncService.subject(ofJWT: token) == userId else {
            logger.error("Session token is for a different user; skipping the refresh")
            return nil
        }

        async let todos: [APITodo]? = get("todos", token: token)
        async let lists: [APIList]? = get("lists", token: token)
        guard let todos = await todos, let lists = await lists else { return nil }
        return Snapshot(todos: todos, lists: lists)
    }

    private static func get<T: Decodable>(_ path: String, token: String) async -> T? {
        var request = URLRequest(url: Config.apiBaseURL.appendingPathComponent(path))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = deadline.timeInterval
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                let status = (response as? HTTPURLResponse)?.statusCode ?? -1
                logger.error("GET /\(path, privacy: .public) returned \(status)")
                return nil
            }
            return try JSONDecoder.api.decode(T.self, from: data)
        } catch {
            logger.error("GET /\(path, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    // MARK: - Deadline

    /// `operation`'s result, or nil if it hasn't finished within `limit`.
    /// Returns at the deadline even if `operation` ignores cancellation (a
    /// Clerk client refresh might), which a task group wouldn't: it waits for
    /// every child before returning.
    static func withDeadline<T>(
        _ limit: Duration,
        operation: @escaping () async -> T?
    ) async -> T? {
        await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
            let gate = FirstCaller()
            let work = Task { @MainActor in
                await operation()
            }
            let timer = Task { @MainActor in
                try? await Task.sleep(for: limit)
                guard gate.claim() else { return }
                continuation.resume(returning: nil)
                work.cancel()
            }
            Task { @MainActor in
                let value = await work.value
                timer.cancel()
                guard gate.claim() else { return }
                continuation.resume(returning: value)
            }
        }
    }

    /// Lets exactly one side resume the continuation, whichever gets there
    /// first. Not generic on purpose: a generic class holding the
    /// continuation crashed Swift 6.3.3's inliner in its deinit when
    /// archiving the Mac app for release.
    private final class FirstCaller {
        private var claimed = false

        /// True for the first call only.
        func claim() -> Bool {
            guard !claimed else { return false }
            claimed = true
            return true
        }
    }
}

private extension Duration {
    var timeInterval: TimeInterval {
        let (seconds, attoseconds) = components
        return TimeInterval(seconds) + TimeInterval(attoseconds) / 1e18
    }
}
