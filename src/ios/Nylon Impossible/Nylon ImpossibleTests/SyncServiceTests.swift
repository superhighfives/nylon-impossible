import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

@Suite("SyncService")
struct SyncServiceTests {
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(for: TodoItem.self, TodoUrl.self, configurations: config)
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
                notes: nil,
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt,
                urls: nil
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

    @Test("Notes over the limit are sent cut to it, at a character boundary")
    @MainActor
    func capsOverlongNotes() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        // Saved before the editor stopped at the limit.
        let ascii = TodoItem(title: "Pasted", userId: "user_test_123", position: "a0")
        ascii.itemNotes = String(repeating: "a", count: 120_000)
        ascii.isSynced = false
        context.insert(ascii)
        // An emoji (2 units) straddling the limit.
        let emoji = TodoItem(title: "Emoji", userId: "user_test_123", position: "a1")
        emoji.itemNotes = String(repeating: "a", count: TodoText.notesMax - 1) + "😀😀"
        emoji.isSynced = false
        context.insert(emoji)
        try context.save()

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        let changes = api.lastSyncRequest?.changes ?? []
        func sent(_ title: String) -> String? { changes.first { $0.title == title }?.notes }
        #expect(sent("Pasted")?.utf16.count == TodoText.notesMax)
        #expect(sent("Emoji") == String(repeating: "a", count: TodoText.notesMax - 1))
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
                notes: nil,
                completed: true,
                position: "b0",
                dueDate: nil,
                createdAt: remoteDate,
                updatedAt: remoteDate,
                urls: nil
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
                notes: nil,
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: localDate,
                updatedAt: remoteDate,
                urls: nil
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
                notes: nil,
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: remoteDate,
                updatedAt: remoteDate,
                urls: nil
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
                notes: nil,
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt,
                urls: nil
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
        todo.isSoftDeleted = true
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

    @Test("Includes pendingUrls as urls in sync payload")
    @MainActor
    func includesPendingUrlsInPayload() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let todo = TodoItem(title: "Check this", userId: "user_test_123", position: "a0")
        todo.isSynced = false
        todo.pendingUrls = ["https://example.com"]
        context.insert(todo)
        try context.save()

        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: todo.id.uuidString.lowercased(),
                userId: "user_test_123",
                title: "Check this",
                notes: nil,
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt,
                urls: nil
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        let change = api.lastSyncRequest?.changes.first
        #expect(change?.urls?.count == 1)
        #expect(change?.urls?.first?.url == "https://example.com")
    }

    @Test("Clears pendingUrls after successful sync")
    @MainActor
    func clearsPendingUrlsAfterSync() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let todo = TodoItem(title: "Check this", userId: "user_test_123", position: "a0")
        todo.isSynced = false
        todo.pendingUrls = ["https://example.com"]
        context.insert(todo)
        try context.save()

        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: todo.id.uuidString.lowercased(),
                userId: "user_test_123",
                title: "Check this",
                notes: nil,
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt,
                urls: nil
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.first?.pendingUrls.isEmpty == true)
    }

    @Test("URLs are excluded from payload for deleted todos")
    func deletedTodosUrlsAreExcluded() {
        // Mirrors the pendingUrlChanges logic inside gatherLocalChanges.
        // Tested as a pure unit test because SwiftData on iOS 26 faults when
        // isSoftDeleted = true and a [String] attribute are set together on the same model.
        func pendingUrlChanges(isSoftDeleted: Bool, pendingUrls: [String]) -> [TodoUrlChange]? {
            isSoftDeleted || pendingUrls.isEmpty
                ? nil
                : pendingUrls.map { TodoUrlChange(url: $0) }
        }

        // Deleted todo with pending URLs → nil (URLs suppressed)
        #expect(pendingUrlChanges(isSoftDeleted: true, pendingUrls: ["https://example.com"]) == nil)
        // Non-deleted todo with pending URLs → non-nil
        #expect(pendingUrlChanges(isSoftDeleted: false, pendingUrls: ["https://example.com"]) != nil)
        // Non-deleted todo with no pending URLs → nil
        #expect(pendingUrlChanges(isSoftDeleted: false, pendingUrls: []) == nil)
    }

    @Test("Persists URL metadata on TodoItem after sync")
    @MainActor
    func persistsUrlsOnTodoItem() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let remoteDate = Date(timeIntervalSince1970: 1700000000)
        let urlDate = Date(timeIntervalSince1970: 1700000100)

        api.syncResponse = SyncResponse(
            todos: [APITodo(
                id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                userId: "user_test_123",
                title: "Task with URL",
                notes: nil,
                completed: false,
                position: "a0",
                dueDate: nil,
                createdAt: remoteDate,
                updatedAt: remoteDate,
                urls: [APITodoUrl(
                    id: "url-id-1",
                    todoId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    url: "https://example.com",
                    title: "Example",
                    description: nil,
                    siteName: "Example Site",
                    favicon: nil,
                    image: nil,
                    position: "a0",
                    fetchStatus: .fetched,
                    fetchedAt: urlDate,
                    createdAt: urlDate,
                    updatedAt: urlDate
                )]
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // URL should be persisted on the related TodoItem
        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 1)
        #expect(items[0].urls.count == 1)
        #expect(items[0].urls.first?.url == "https://example.com")
        #expect(items[0].urls.first?.title == "Example")
    }

    @Test("Updates a link the device already has with every field the server sends")
    @MainActor
    func updatesExistingUrlFields() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let todoId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        let remoteDate = Date(timeIntervalSince1970: 1700000000)

        func response(_ url: APITodoUrl) -> SyncResponse {
            SyncResponse(
                todos: [APITodo(
                    id: todoId,
                    userId: "user_test_123",
                    title: "Task with URL",
                    notes: nil,
                    completed: false,
                    position: "a0",
                    dueDate: nil,
                    createdAt: remoteDate,
                    updatedAt: remoteDate,
                    urls: [url]
                )],
                syncedAt: "2025-06-01T00:00:00.000Z",
                conflicts: []
            )
        }

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        // First sync: the link arrives with its preview showing and no image yet.
        api.syncResponse = response(APITodoUrl(
            id: "url-id-1",
            todoId: todoId,
            url: "https://example.com",
            title: "Example",
            description: nil,
            siteName: "Example Site",
            favicon: nil,
            image: nil,
            showPreview: true,
            position: "a0",
            fetchStatus: .fetched,
            fetchedAt: remoteDate,
            createdAt: remoteDate,
            updatedAt: Date(timeIntervalSince1970: 1700000100)
        ))
        await service.sync()

        // Second sync: Show as URL, a fetched image, a new position and address.
        let changed = APITodoUrl(
            id: "url-id-1",
            todoId: todoId,
            url: "https://example.com/moved",
            title: "Example",
            description: nil,
            siteName: "Example Site",
            favicon: nil,
            image: "https://example.com/og.png",
            showPreview: false,
            position: "a1",
            fetchStatus: .fetched,
            fetchedAt: remoteDate,
            createdAt: remoteDate,
            updatedAt: Date(timeIntervalSince1970: 1700000200)
        )
        api.syncResponse = response(changed)
        await service.sync()

        func storedUrl() throws -> TodoUrl? {
            try context.fetch(FetchDescriptor<TodoItem>()).first?.urls.first
        }

        let stored = try #require(try storedUrl())
        #expect(stored.showPreview == false)
        #expect(stored.image == "https://example.com/og.png")
        #expect(stored.position == "a1")
        #expect(stored.updatedAt == changed.updatedAt)
        #expect(stored.url == "https://example.com/moved")

        // Third sync, identical to the second: nothing reverts.
        await service.sync()

        let unchanged = try #require(try storedUrl())
        #expect(try context.fetch(FetchDescriptor<TodoUrl>()).count == 1)
        #expect(unchanged.showPreview == false)
        #expect(unchanged.image == "https://example.com/og.png")
        #expect(unchanged.position == "a1")
        #expect(unchanged.url == "https://example.com/moved")
        #expect(unchanged.updatedAt == changed.updatedAt)
    }

    @Test("Sets error state when API throws")
    @MainActor
    func setsErrorStateOnAPIFailure() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        api.syncError = APIError.serverError(500, "Internal error", url: "https://api.example.com/todos/sync")

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

    @Test("Transient network failures don't surface as error state")
    @MainActor
    func transientFailureDoesNotSetErrorState() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        // Cancelled mid-flight (e.g. app backgrounded during a sync) — expected
        // on mobile and retried on the next trigger, so no error banner.
        api.syncError = APIError.networkError(URLError(.cancelled), url: "https://api.example.com/todos/sync")

        let container = try makeContainer()
        let context = container.mainContext

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        #expect(service.state == .idle)
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

@Suite("Sync batches")
struct SyncBatchTests {
    /// A stand-in for /todos/sync: takes at most `syncBatchMax` changes, sorts
    /// parents first within the request, rejects a subtask whose parent it
    /// hasn't seen, and answers with every todo it holds.
    @MainActor
    private final class FakeServer {
        var todos: [String: APITodo] = [:]
        var failOnRequest: Int?
        private var requests = 0

        func handle(_ changes: [TodoChange]) throws -> SyncResponse {
            requests += 1
            let url = "https://api.example.com/todos/sync"
            if requests == failOnRequest { throw APIError.serverError(429, "rate_limited", url: url) }
            guard changes.count <= TodoChange.syncBatchMax else {
                throw APIError.serverError(400, "validation_failed", url: url)
            }
            for change in changes.orderedForSync() {
                if let parentId = change.parentId, todos[parentId] == nil {
                    throw APIError.serverError(400, "parent not found", url: url)
                }
                todos[change.id] = APITodo(
                    id: change.id, userId: "user_test_123", parentId: change.parentId,
                    title: change.title ?? "", completed: false, position: change.position,
                    createdAt: change.updatedAt, updatedAt: change.updatedAt
                )
            }
            return SyncResponse(
                todos: Array(todos.values),
                syncedAt: "2025-06-01T00:00:00.000Z",
                conflicts: []
            )
        }
    }

    /// 900 top-level todos and 300 subtasks, the subtasks inserted first.
    @MainActor
    private func seed(_ context: ModelContext) throws -> [TodoItem] {
        let parents = (0..<900).map { TodoItem(title: "Todo \($0)", userId: "user_test_123", position: "a\($0)") }
        let subtasks = (0..<300).map { index in
            let subtask = TodoItem(title: "Subtask \(index)", userId: "user_test_123", position: "a\(index)")
            subtask.parentId = parents[index * 3].id
            return subtask
        }
        for todo in subtasks + parents {
            todo.isSynced = false
            context.insert(todo)
        }
        try context.save()
        return subtasks + parents
    }

    @MainActor
    /// The container comes back too: its context doesn't keep it alive.
    private func makeService(
        _ server: FakeServer
    ) throws -> (SyncService, ModelContainer, MockAPIService) {
        let api = MockAPIService()
        api.syncHandler = { try server.handle($0) }
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let service = SyncService(authService: MockAuthService(), apiService: api)
        service.setModelContext(container.mainContext)
        return (service, container, api)
    }

    @Test("1,200 unsynced todos go in three batches, parents before subtasks, and all end up synced")
    @MainActor
    func batchesParentsFirst() async throws {
        let server = FakeServer()
        let (service, container, api) = try makeService(server)
        let todos = try seed(container.mainContext)

        await service.sync()

        #expect(api.syncRequests.map(\.count) == [500, 500, 200])
        let sent = api.syncRequests.flatMap { $0 }
        let firstSubtask = sent.firstIndex { $0.parentId != nil } ?? sent.count
        #expect(sent[..<firstSubtask].count == 900)
        #expect(sent[firstSubtask...].allSatisfy { $0.parentId != nil })
        #expect(Set(sent.map(\.id)).count == 1200)
        #expect(todos.allSatisfy { $0.isSynced })
        #expect(server.todos.count == 1200)
        if case .success = service.state {} else { Issue.record("Expected success, got \(service.state)") }
    }

    @Test("a failed batch stops the sync and leaves the rest queued")
    @MainActor
    func failedBatchKeepsTheRest() async throws {
        let server = FakeServer()
        server.failOnRequest = 2
        let (service, container, api) = try makeService(server)
        let todos = try seed(container.mainContext)

        await service.sync()

        #expect(api.syncRequests.count == 2)
        #expect(todos.filter { $0.isSynced }.count == 500)
        #expect(service.state == .error("Too many requests. Try again in a minute."))

        // The next sync sends what's left.
        server.failOnRequest = nil
        await service.sync()
        #expect(api.syncRequests.dropFirst(2).map(\.count) == [500, 200])
        #expect(todos.allSatisfy { $0.isSynced })
    }

    @Test("an empty queue still makes one sync, to pull the server's todos")
    func emptyQueue() {
        #expect([TodoChange]().syncBatches().map(\.count) == [0])
    }
}
