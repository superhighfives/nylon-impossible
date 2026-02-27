import Foundation
@testable import Nylon_Impossible

final class MockAPIService: APIProviding, @unchecked Sendable {
    var syncResponse: SyncResponse = SyncResponse(
        todos: [],
        syncedAt: "2025-01-01T00:00:00.000Z",
        conflicts: []
    )
    var syncError: Error?
    var lastSyncRequest: (lastSyncedAt: Date?, changes: [TodoChange])?

    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse {
        lastSyncRequest = (lastSyncedAt, changes)
        if let error = syncError {
            throw error
        }
        return syncResponse
    }
}
