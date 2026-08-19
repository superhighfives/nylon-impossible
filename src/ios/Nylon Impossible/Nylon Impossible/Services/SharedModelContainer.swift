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
            return try ModelContainer(for: schema, configurations: config)
        } catch {
            // SwiftData can fail to open a store it can't lightweight-migrate
            // (NYLON-IMPOSSIBLE-IOS-8: the listId UUID->String rename+re-add in
            // build 155 hit SwiftDataError.loadIssueModelContainer on existing
            // stores — see `TodoItem.listKey` for why that shape was
            // un-inferable). This used to be a fatalError, which permanently
            // bricked the app and its extensions/intents (all share this
            // container) for anyone who hit it - there's no user-facing
            // recovery, just a crash loop. The local store is a sync cache, not
            // the source of truth (see SyncService), so it's safe to drop and
            // recreate it: any local-only unsynced todos are lost, but the app
            // becomes usable again instead of crash-looping forever.
            //
            // Reaching here at all is a bug in a schema change, not a routine
            // fallback — hence still error level, tagged so a reset is
            // distinguishable in Sentry from a hard failure below.
            capture(error, stage: "open")
            destroyStore(at: storeURL)
            do {
                return try ModelContainer(for: schema, configurations: config)
            } catch {
                // Can't even create a store at a path we just cleared (disk
                // full, App Group revoked). Run from memory rather than
                // crash-loop: the app is degraded — this session's writes are
                // lost on quit — but usable, and sync repopulates it from the
                // server, which is where the todos actually live.
                capture(error, stage: "recreate")
                let memoryConfig = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
                do {
                    return try ModelContainer(for: schema, configurations: memoryConfig)
                } catch {
                    fatalError("Failed to create in-memory model container: \(error)")
                }
            }
        }
    }()

    private static func capture(_ error: Error, stage: String) {
        SentrySDK.capture(error: error) { scope in
            scope.setTag(value: "SharedModelContainer.\(stage)", key: "area")
        }
    }

    /// Best-effort delete of the SQLite store (plus its WAL/SHM sidecar files)
    /// so a fresh `ModelContainer` can be created in its place. Only called
    /// after opening the existing store has already failed.
    private static func destroyStore(at storeURL: URL) {
        let fileManager = FileManager.default
        for suffix in ["", "-wal", "-shm"] {
            try? fileManager.removeItem(atPath: storeURL.path + suffix)
        }
    }
}
