import Foundation
@testable import Nylon_Impossible

@MainActor
final class MockAPIService: APIProviding {
    var syncResponse: SyncResponse = SyncResponse(
        todos: [],
        syncedAt: "2025-01-01T00:00:00.000Z",
        conflicts: []
    )
    var syncError: Error?
    var lastSyncRequest: (lastSyncedAt: Date?, changes: [TodoChange])?

    var smartCreateResponse: SmartCreateResponse = SmartCreateResponse(
        todos: [],
        ai: false
    )
    var smartCreateError: Error?
    var lastSmartCreateText: String?

    func sync(lastSyncedAt: Date?, changes: [TodoChange]) async throws -> SyncResponse {
        lastSyncRequest = (lastSyncedAt, changes)
        if let error = syncError {
            throw error
        }
        return syncResponse
    }

    func smartCreate(text: String) async throws -> SmartCreateResponse {
        lastSmartCreateText = text
        if let error = smartCreateError {
            throw error
        }
        return smartCreateResponse
    }
}
