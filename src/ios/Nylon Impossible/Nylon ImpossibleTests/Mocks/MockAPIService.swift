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
        location: nil,
        createdAt: Date(timeIntervalSince1970: 1735689600),
        updatedAt: Date(timeIntervalSince1970: 1735689600)
    )
    var getMeError: Error?

    var updateMeResponse: APIUser?
    var updateMeError: Error?
    var lastUpdateMeRequest: UpdateUserRequest?

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

    func updateMe(_ request: UpdateUserRequest) async throws -> APIUser {
        lastUpdateMeRequest = request
        if let error = updateMeError {
            throw error
        }
        let newLocation: String?
        if case .some(let loc) = request.location {
            newLocation = loc
        } else {
            newLocation = getMeResponse.location
        }
        return updateMeResponse ?? APIUser(
            id: getMeResponse.id,
            email: getMeResponse.email,
            aiEnabled: request.aiEnabled ?? getMeResponse.aiEnabled,
            location: newLocation,
            createdAt: getMeResponse.createdAt,
            updatedAt: Date()
        )
    }
}
