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
        
        // Every target — app, share extension, intents — opens this one store in
        // the App Group container. Without that container there's no agreed
        // location to write to; run from memory rather than trap on a `!`, the
        // same trade as the fallbacks below.
        guard let appGroupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.superhighfives.Nylon-Impossible"
        ) else {
            SentrySDK.capture(message: "App Group container unavailable") { scope in
                scope.setTag(value: "SharedModelContainer.appGroup", key: "area")
                scope.setLevel(.error)
            }
            return inMemoryContainer(for: schema)
        }

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

            // Only the app gets to do the destroying. Extensions run without
            // the user having asked for anything much — the widget's timeline
            // is refreshed by the system, and after an update it can easily be
            // the first process to open the store at all — so an extension
            // that reset it would throw away unsynced todos before the app had
            // a chance to try. Degrading to in-memory means the widget renders
            // empty for now and the reset (with the sync that repopulates it)
            // happens on next launch, where it belongs.
            guard isMainApp else { return inMemoryContainer(for: schema) }

            destroyStore(at: storeURL)
            do {
                return try ModelContainer(for: schema, configurations: config)
            } catch {
                // Can't create a store even at a path we just cleared — the
                // filesystem is against us (disk full, sandbox trouble).
                capture(error, stage: "recreate")
                return inMemoryContainer(for: schema)
            }
        }
    }()

    /// Last resort when no store can be opened: a container with nothing behind
    /// it. Degraded — this session's writes are lost on quit, and nothing is
    /// shared with the extensions — but the app runs, and sync repopulates it
    /// from the server, which is where the todos actually live.
    private static func inMemoryContainer(for schema: Schema) -> ModelContainer {
        do {
            return try ModelContainer(
                for: schema,
                configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            )
        } catch {
            // Still fatal, unlike everything above it: with no disk, no App
            // Group and no migration in play, a schema that won't construct in
            // memory is a bug in the models themselves rather than a condition
            // the device got itself into — and there's nothing left to fall back
            // to. Every caller of this container is unusable without it.
            fatalError("Failed to create in-memory model container: \(error)")
        }
    }

    /// False in the share extension, the widget, and any other appex — all of
    /// which are bundled inside the app, so their bundle URL ends in `.appex`.
    private static var isMainApp: Bool {
        Bundle.main.bundleURL.pathExtension != "appex"
    }

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
