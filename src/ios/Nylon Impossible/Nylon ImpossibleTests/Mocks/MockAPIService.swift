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

    var getMeResponse: APIUser = APIUser(
        id: "mock-user-id",
        email: "test@example.com",
        aiEnabled: true,
        createdAt: Date(timeIntervalSince1970: 1735689600),
        updatedAt: Date(timeIntervalSince1970: 1735689600)
    )
    var getMeError: Error?

    var updateMeResponse: APIUser?
    var updateMeError: Error?
    var lastUpdateMeAiEnabled: Bool?

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

    func getMe() async throws -> APIUser {
        if let error = getMeError {
            throw error
        }
        return getMeResponse
    }

    func updateMe(aiEnabled: Bool) async throws -> APIUser {
        lastUpdateMeAiEnabled = aiEnabled
        if let error = updateMeError {
            throw error
        }
        return updateMeResponse ?? APIUser(
            id: getMeResponse.id,
            email: getMeResponse.email,
            aiEnabled: aiEnabled,
            createdAt: getMeResponse.createdAt,
            updatedAt: Date()
        )
    }
}
