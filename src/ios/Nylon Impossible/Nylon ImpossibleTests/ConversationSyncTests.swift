import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

@Suite("Conversation sync")
struct ConversationSyncTests {
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoMessage.self, configurations: config
        )
    }

    private func remoteTodo(
        id: String,
        needsInput: Bool,
        messages: [APITodoMessage],
        updatedAt: Date = Date(timeIntervalSince1970: 1_700_000_000)
    ) -> APITodo {
        APITodo(
            id: id,
            userId: "user_test_123",
            title: "Book a flight",
            notes: nil,
            completed: false,
            position: "a0",
            dueDate: nil,
            priority: nil,
            aiStatus: nil,
            needsInput: needsInput,
            createdAt: updatedAt,
            updatedAt: updatedAt,
            urls: nil,
            research: nil,
            messages: messages
        )
    }

    @Test("Upserts incoming messages and needsInput from the server")
    @MainActor
    func upsertsIncomingMessages() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let todoId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        api.syncResponse = SyncResponse(
            todos: [remoteTodo(
                id: todoId,
                needsInput: true,
                messages: [APITodoMessage(
                    id: "msg-1",
                    todoId: todoId,
                    role: "assistant",
                    content: "Where to, and when?",
                    createdAt: Date(timeIntervalSince1970: 1_700_000_050),
                    awaitingReply: true
                )]
            )],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        let items = try context.fetch(FetchDescriptor<TodoItem>())
        #expect(items.count == 1)
        #expect(items[0].needsInput == true)
        #expect(items[0].messages.count == 1)
        #expect(items[0].messages.first?.content == "Where to, and when?")
        #expect(items[0].messages.first?.awaitingReply == true)
        #expect(items[0].messages.first?.isSynced == true)
    }

    @Test("Updates awaitingReply on an existing message in place")
    @MainActor
    func updatesAwaitingReplyInPlace() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        let todoId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        let message = APITodoMessage(
            id: "msg-1",
            todoId: todoId,
            role: "assistant",
            content: "Where to?",
            createdAt: Date(timeIntervalSince1970: 1_700_000_050),
            awaitingReply: true
        )

        // First sync: message awaiting a reply.
        api.syncResponse = SyncResponse(
            todos: [remoteTodo(id: todoId, needsInput: true, messages: [message])],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )
        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)
        await service.sync()

        // Second sync: same message id, now no longer awaiting.
        let cleared = APITodoMessage(
            id: "msg-1",
            todoId: todoId,
            role: "assistant",
            content: "Where to?",
            createdAt: message.createdAt,
            awaitingReply: false
        )
        api.syncResponse = SyncResponse(
            todos: [remoteTodo(
                id: todoId,
                needsInput: false,
                messages: [cleared],
                updatedAt: Date(timeIntervalSince1970: 1_700_000_500)
            )],
            syncedAt: "2025-06-01T00:01:00.000Z",
            conflicts: []
        )
        await service.sync()

        let items = try context.fetch(FetchDescriptor<TodoItem>())
        #expect(items.count == 1)
        #expect(items[0].messages.count == 1) // not duplicated
        #expect(items[0].messages.first?.awaitingReply == false)
        #expect(items[0].needsInput == false)
    }

    @Test("Pushes an offline reply on the next sync")
    @MainActor
    func pushesOfflineReply() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        let container = try makeContainer()
        let context = container.mainContext

        // A synced todo with a locally-created (unsynced) user reply.
        let todo = TodoItem(title: "Book a flight", userId: "user_test_123", position: "a0")
        todo.isSynced = true
        context.insert(todo)
        let reply = TodoMessage(role: "user", content: "Lisbon", isSynced: false)
        reply.todo = todo
        context.insert(reply)
        try context.save()

        api.syncResponse = SyncResponse(
            todos: [remoteTodo(id: todo.id.uuidString.lowercased(), needsInput: false, messages: [])],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // The reply should have been pushed to the server and marked synced.
        #expect(api.lastReply?.todoId == todo.id.uuidString.lowercased())
        #expect(api.lastReply?.content == "Lisbon")

        let messages = try context.fetch(FetchDescriptor<TodoMessage>())
        let pushed = messages.first { $0.role == "user" }
        #expect(pushed?.isSynced == true)
    }

    @Test("Keeps an unsynced reply when the push fails")
    @MainActor
    func keepsUnsyncedReplyOnFailure() async throws {
        let auth = MockAuthService()
        let api = MockAPIService()
        api.replyError = APIError.networkError(
            URLError(.notConnectedToInternet),
            url: "https://api.example.com/todos/x/reply"
        )
        let container = try makeContainer()
        let context = container.mainContext

        let todo = TodoItem(title: "Book a flight", userId: "user_test_123", position: "a0")
        todo.isSynced = true
        context.insert(todo)
        let reply = TodoMessage(role: "user", content: "Lisbon", isSynced: false)
        reply.todo = todo
        context.insert(reply)
        try context.save()

        api.syncResponse = SyncResponse(
            todos: [remoteTodo(id: todo.id.uuidString.lowercased(), needsInput: false, messages: [])],
            syncedAt: "2025-06-01T00:00:00.000Z",
            conflicts: []
        )

        let service = SyncService(authService: auth, apiService: api)
        service.setModelContext(context)

        await service.sync()

        // The push failed, so the reply stays unsynced for the next attempt and
        // is not deleted by the message-reconciliation step.
        let messages = try context.fetch(FetchDescriptor<TodoMessage>())
        let local = messages.first { $0.role == "user" }
        #expect(local != nil)
        #expect(local?.isSynced == false)
    }
}
