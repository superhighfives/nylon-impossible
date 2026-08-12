//
//  SyncService+Lists.swift
//  Nylon Impossible
//
//  Split out of SyncService.swift to keep its type body under SwiftLint's
//  length limit — this extension has no state of its own, just the list-sync
//  step of the main `sync()` flow.
//

import Foundation
import Sentry
import SwiftData

extension SyncService {
    /// Fetch the user's lists and upsert them locally (server-authoritative —
    /// no local-only list state to preserve, unlike todos). Best-effort: a
    /// failure here doesn't fail the whole sync, since todos already applied.
    func syncLists(apiService: any APIProviding, userId: String) async {
        guard let modelContext else { return }
        do {
            let remoteLists = try await apiService.listLists()
            let remoteIds = Set(remoteLists.map { $0.id })

            let descriptor = FetchDescriptor<TodoListModel>(
                predicate: #Predicate { $0.userId == userId }
            )
            let localLists = try modelContext.fetch(descriptor)
            let existingById = localLists.reduce(into: [:]) { dict, list in dict[list.id] = list }

            for remote in remoteLists {
                if let existing = existingById[remote.id] {
                    existing.name = remote.name
                    existing.kind = remote.kind
                    existing.systemKindRaw = remote.systemKind
                    existing.position = remote.position
                    existing.updatedAt = remote.updatedAt
                    existing.isSynced = true
                } else {
                    modelContext.insert(TodoListModel(from: remote))
                }
            }

            // Remove local lists the server no longer has (e.g. deleted elsewhere).
            for local in localLists where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            if !APIError.isNetworkFailure(error), !APIError.isTransientNetworkError(error) {
                SentrySDK.capture(error: error) { scope in
                    scope.setTag(value: "list-sync", key: "area")
                }
            }
        }
    }
}
