//
//  SharedModelContainer.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import Foundation
import Sentry
import SwiftData

enum SharedModelContainer {
    static let shared: ModelContainer = {
        let schema = Schema([TodoItem.self, TodoUrl.self, TodoMessage.self, TodoSuggestion.self, TodoListModel.self])
        
        // Use App Group container for shared access
        let appGroupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.superhighfives.Nylon-Impossible"
        )!
        
        let storeURL = appGroupURL.appendingPathComponent("nylon.store")
        
        let config = ModelConfiguration(
            schema: schema,
            url: storeURL,
            cloudKitDatabase: .none
        )
        
        do {
            let container = try ModelContainer(for: schema, configurations: config)
            backfillLegacyListIds(in: container)
            return container
        } catch {
            // SwiftData can fail to open a store it can't lightweight-migrate
            // (e.g. NYLON-IMPOSSIBLE-IOS-8: the listId UUID->String rename+add
            // in build 155 hit SwiftDataError.loadIssueModelContainer on some
            // existing stores). This used to be a fatalError, which permanently
            // bricked the app and its extensions/intents (all share this
            // container) for anyone who hit it - there's no user-facing
            // recovery, just a crash loop. The local store is a sync cache, not
            // the source of truth (see SyncService), so it's safe to drop and
            // recreate it: any local-only unsynced todos are lost, but the app
            // becomes usable again instead of crash-looping forever.
            SentrySDK.capture(error: error) { scope in
                scope.setTag(value: "SharedModelContainer.open", key: "area")
            }
            destroyStore(at: storeURL)
            do {
                let container = try ModelContainer(for: schema, configurations: config)
                backfillLegacyListIds(in: container)
                return container
            } catch {
                fatalError("Failed to create shared model container after store reset: \(error)")
            }
        }
    }()

    /// Best-effort delete of the SQLite store (plus its WAL/SHM sidecar files)
    /// so a fresh `ModelContainer` can be created in its place. Only called
    /// after opening the existing store has already failed.
    private static func destroyStore(at storeURL: URL) {
        let fileManager = FileManager.default
        for suffix in ["", "-wal", "-shm"] {
            try? fileManager.removeItem(atPath: storeURL.path + suffix)
        }
    }

    /// One-time bridge for `TodoItem.listId`'s UUID? -> String? change. The old
    /// value survives the store migration under the renamed `listIdLegacy`
    /// column (see `TodoItem`); copy it into the new String `listId` so list
    /// membership is correct immediately, without waiting for the next full
    /// sync. Runs once per process, before any sync touches the store (this is
    /// called inside `shared`'s initializer). Idempotent: a row is only touched
    /// while it still has a legacy value and no new one, and `listIdLegacy` is
    /// cleared as it's copied, so subsequent launches find nothing to do.
    ///
    /// Filtered in memory rather than with a #Predicate — predicates over
    /// optional UUIDs are unreliable (see TaskCreationService.fetchAllTodos) and
    /// the local store is small.
    private static func backfillLegacyListIds(in container: ModelContainer) {
        let context = ModelContext(container)
        let all: [TodoItem]
        do {
            all = try context.fetch(FetchDescriptor<TodoItem>())
        } catch {
            SentrySDK.capture(error: error) { scope in
                scope.setTag(value: "backfillLegacyListIds.fetch", key: "area")
            }
            return
        }
        let stale = all.filter { $0.listId == nil && $0.listIdLegacy != nil }
        guard !stale.isEmpty else { return }
        for todo in stale {
            todo.listId = todo.listIdLegacy?.uuidString.lowercased()
            todo.listIdLegacy = nil
        }
        do {
            try context.save()
        } catch {
            SentrySDK.capture(error: error) { scope in
                scope.setTag(value: "backfillLegacyListIds.save", key: "area")
            }
        }
    }
}
