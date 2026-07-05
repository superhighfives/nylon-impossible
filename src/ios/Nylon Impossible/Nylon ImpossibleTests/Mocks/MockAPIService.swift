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
        plan: "pro",
        location: nil,
        theme: "system",
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
            plan: getMeResponse.plan,
            location: newLocation,
            theme: request.theme ?? getMeResponse.theme,
            createdAt: getMeResponse.createdAt,
            updatedAt: Date()
        )
    }

    var importGoogleTasksResponse: GoogleTasksImportResponse = GoogleTasksImportResponse(
        imported: 0,
        skipped: 0,
        importedIds: [],
        datedTodos: []
    )
    var importGoogleTasksError: Error?
    var importGoogleTasksCallCount = 0

    func importGoogleTasks() async throws -> GoogleTasksImportResponse {
        importGoogleTasksCallCount += 1
        if let error = importGoogleTasksError {
            throw error
        }
        return importGoogleTasksResponse
    }

    var deleteMeError: Error?
    var deleteMeCallCount = 0

    func deleteMe() async throws {
        deleteMeCallCount += 1
        if let error = deleteMeError {
            throw error
        }
    }

    var reresearchError: Error?
    var lastReresearchTodoId: String?

    func reresearch(todoId: String) async throws {
        lastReresearchTodoId = todoId
        if let error = reresearchError {
            throw error
        }
    }

    var cancelResearchError: Error?
    var lastCancelResearchTodoId: String?

    func cancelResearch(todoId: String) async throws {
        lastCancelResearchTodoId = todoId
        if let error = cancelResearchError {
            throw error
        }
    }

    var replyError: Error?
    var replyResponseId: String = "mock-message-id"
    var lastReply: (todoId: String, content: String)?

    func replyToTodo(todoId: String, content: String) async throws -> String {
        lastReply = (todoId, content)
        if let error = replyError {
            throw error
        }
        return replyResponseId
    }

    var dismissQuestionError: Error?
    var lastDismissTodoId: String?

    func dismissQuestion(todoId: String) async throws {
        lastDismissTodoId = todoId
        if let error = dismissQuestionError {
            throw error
        }
    }
}
