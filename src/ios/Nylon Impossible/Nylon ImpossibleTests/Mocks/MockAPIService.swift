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

    var getMeResponse: APIUser = APIUser(
        id: "mock-user-id",
        email: "test@example.com",
        plan: "pro",
        location: nil,
        theme: "system",
        hideCompleted: false,
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
            plan: getMeResponse.plan,
            location: newLocation,
            theme: request.theme ?? getMeResponse.theme,
            hideCompleted: request.hideCompleted ?? getMeResponse.hideCompleted,
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

    var processTodoError: Error?
    var processTodoLinkCount: Int = 1
    var lastProcessTodoId: String?

    func processTodo(todoId: String) async throws -> Int {
        lastProcessTodoId = todoId
        if let error = processTodoError {
            throw error
        }
        return processTodoLinkCount
    }

    var listsToReturn: [APIList] = []
    var listListsError: Error?

    func listLists() async throws -> [APIList] {
        if let error = listListsError { throw error }
        return listsToReturn
    }

    var createListError: Error?
    var lastCreateList: (name: String, position: String?)?

    func createList(name: String, position: String?) async throws -> APIList {
        lastCreateList = (name, position)
        if let error = createListError { throw error }
        let now = Date()
        return APIList(
            id: UUID().uuidString, userId: "test-user", name: name,
            kind: "custom", systemKind: nil, position: position ?? "a0",
            createdAt: now, updatedAt: now
        )
    }

    var updateListError: Error?
    var lastUpdateList: (id: String, name: String?, position: String?)?

    func updateList(id: String, name: String?, position: String?) async throws -> APIList {
        lastUpdateList = (id, name, position)
        if let error = updateListError { throw error }
        let now = Date()
        return APIList(
            id: id, userId: "test-user", name: name ?? "List",
            kind: "custom", systemKind: nil, position: position ?? "a0",
            createdAt: now, updatedAt: now
        )
    }

    var deleteListError: Error?
    var lastDeleteListId: String?
    var deleteListTodoCount: Int = 0

    func deleteList(id: String) async throws -> Int {
        lastDeleteListId = id
        if let error = deleteListError { throw error }
        return deleteListTodoCount
    }
}
