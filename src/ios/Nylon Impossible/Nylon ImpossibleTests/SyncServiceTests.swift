import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

@Suite("SyncService")
struct SyncServiceTests {
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(for: TodoItem.self, configurations: config)
    }

    @Test("Skips sync when not signed in")
    @MainActor
    func skipsWhenNotSignedIn() async throws {
        let auth = MockAuthService()
        auth.isSignedIn = false
        let api = MockAPIService()

        let service = SyncService(authService: auth, apiService: api)
        let container = try makeContainer()
        service.setModelContext(container.mainContext)

        await service.sync()

        // API should never be called
        #expect(api.lastSyncRequest == nil)
        #expect(service.state == .idle)
    }

    @Test("Skips sync when userId is nil")
    @MainActor
    func skipsWhenNoUserId() async throws {
        let auth = MockAuthService()
        auth.userId = nil
        let api = MockAPIService()

        let service = SyncService(authService: auth, apiService: api)
        let container = try makeContainer()
        service.setModelContext(container.mainContext)

        await service.sync()

        #expect(api.lastSyncRequest == nil)
    }

    @Test("Skips sync when modelContext is not set")
    @MainActor
    func skipsWhenNoModelContext() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()

        let service = SyncService(authService: auth, apiService: api)
        // Don't set modelContext

        await service.sync()

        #expect(api.lastSyncRequest == nil)
    }

    @Test("Gathers unsynced local changes and sends to API")
    @MainActor
    func gathersUnsyncedChanges() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        // Create an unsynced todo
        let todo = TodoItem(title: "Unsynced task", userId: "user_test_123", position: "a0")
        todo.isSynced = false
        context.insert(todo)
        try context.save()

        // API returns the same todo as synced
        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: todo.id.uuidString.lowercased(),
                userId: "user_test_123",
                title: "Unsynced task",
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // Should have sent the unsynced change
        #expect(api.lastSyncRequest != nil)
        #expect(api.lastSyncRequest?.changes.count == 1)
        #expect(api.lastSyncRequest?.changes[0].title == "Unsynced task")

        // State should be success
        if case .success = service.state {
            // expected
        } else {
            Issue.record("Expected .success state, got \(service.state)")
        }
    }

    @Test("Applies new remote todos locally")
    @MainActor
    func appliesRemoteTodos() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let remoteDate = Date(timeIntervalSince1970: 1700000000)

        // API returns a todo that doesn't exist locally
        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                userId: "user_test_123",
                title: "Remote task",
                completed: true,
                position: "b0",
                dueDate: nil,
                createdAt: remoteDate,
                updatedAt: remoteDate
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // Should have created the todo locally
        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 1)
        #expect(items[0].title == "Remote task")
        #expect(items[0].isCompleted == true)
        #expect(items[0].position == "b0")
        #expect(items[0].isSynced == true)
    }

    @Test("Remote update wins when remote is newer (last-write-wins)")
    @MainActor
    func remoteUpdateWinsWhenNewer() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let localDate = Date(timeIntervalSince1970: 1000)
        let remoteDate = Date(timeIntervalSince1970: 2000)

        // Create a local todo with older timestamp
        let todo = TodoItem(title: "Local title", userId: "user_test_123", position: "a0")
        todo.updatedAt = localDate
        todo.isSynced = true // Already synced, so not in local changes
        context.insert(todo)
        try context.save()

        // API returns same todo with newer timestamp and different title
        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: todo.id.uuidString.lowercased(),
                userId: "user_test_123",
                title: "Remote title",
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: localDate,
                updatedAt: remoteDate
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // Local todo should be updated with remote values
        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 1)
        #expect(items[0].title == "Remote title")
    }

    @Test("Local update preserved when local is newer")
    @MainActor
    func localUpdatePreservedWhenNewer() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let localDate = Date(timeIntervalSince1970: 2000)
        let remoteDate = Date(timeIntervalSince1970: 1000)

        // Create a local todo with newer timestamp (unsynced)
        let todo = TodoItem(title: "Local title", userId: "user_test_123", position: "a0")
        todo.updatedAt = localDate
        todo.isSynced = false
        context.insert(todo)
        try context.save()

        // API returns same todo with older timestamp
        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: todo.id.uuidString.lowercased(),
                userId: "user_test_123",
                title: "Remote title",
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: remoteDate,
                updatedAt: remoteDate
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // Local todo should keep its title since it's newer
        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 1)
        #expect(items[0].title == "Local title")
    }

    @Test("Marks local changes as synced after successful sync")
    @MainActor
    func marksLocalChangesAsSynced() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let todo = TodoItem(title: "Task", userId: "user_test_123", position: "a0")
        todo.isSynced = false
        context.insert(todo)
        try context.save()

        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: todo.id.uuidString.lowercased(),
                userId: "user_test_123",
                title: "Task",
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items[0].isSynced == true)
    }

    @Test("Cleans up synced soft-deleted items")
    @MainActor
    func cleansSyncedDeletedItems() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        // Create a soft-deleted, unsynced todo
        let todo = TodoItem(title: "Deleted", userId: "user_test_123", position: "a0")
        todo.isDeleted = true
        todo.isSynced = false
        context.insert(todo)
        try context.save()

        // API returns empty (server processed the delete)
        api.syncResponse = SyncResponse(
            todos: [],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // The soft-deleted item should be hard-deleted after sync marks it synced
        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 0)
    }

    @Test("Sets error state when API throws")
    @MainActor
    func setsErrorStateOnAPIFailure() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        api.syncError = APIError.networkError(URLError(.notConnectedToInternet))

        let container = try makeContainer()
        let context = container.mainContext

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        if case .error = service.state {
            // expected
        } else {
            Issue.record("Expected .error state, got \(service.state)")
        }
    }

    @Test("Removes local synced items that no longer exist on server")
    @MainActor
    func removesServerDeletedItems() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        // Create a local synced todo (previously synced to server)
        let todo = TodoItem(title: "Will be deleted remotely", userId: "user_test_123", position: "a0")
        todo.isSynced = true
        context.insert(todo)
        try context.save()

        // API returns empty - this item was deleted on the server
        api.syncResponse = SyncResponse(
            todos: [],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // Local item should be removed since server doesn't have it
        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 0)
    }
}
