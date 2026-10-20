import Foundation
import SwiftData
import Testing
@testable import Nylon_Impossible

/// `TodoItem.isSoftDeleted` was `isDeleted`, which collided with SwiftData's
/// own `PersistentModel.isDeleted`: once a todo was saved, reads returned
/// SwiftData's flag (false) instead, so a delete synced as an ordinary
/// update. These cover the rename and the migration of existing stores.
@Suite("Soft delete")
struct SoftDeleteTests {
    private static func storeURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("soft-delete-\(UUID().uuidString).store")
    }

    /// A todo saved, then deleted the way `TodoViewModel.deleteTodo` does,
    /// then synced. Returns the change sent for it.
    @MainActor
    private func syncDeletedTodo(_ configuration: ModelConfiguration) async throws -> TodoChange? {
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self, configurations: configuration
        )
        let context = container.mainContext
        let todo = TodoItem(title: "Delete me", userId: "user_test_123", position: "a0")
        todo.isSynced = true
        context.insert(todo)
        try context.save()

        TodoViewModel().deleteTodo(todo, context: context)
        try context.save()
        #expect(todo.isSoftDeleted)

        let api = MockAPIService()
        let service = SyncService(authService: MockAuthService(), apiService: api)
        service.setModelContext(context)
        await service.sync()
        return api.lastSyncRequest?.changes.first { $0.id == todo.id.uuidString.lowercased() }
    }

    @Test("a todo deleted after it was saved syncs as a delete (on disk)")
    @MainActor
    func deleteSyncsOnDisk() async throws {
        let change = try await syncDeletedTodo(ModelConfiguration(url: Self.storeURL()))
        #expect(change?.deleted == true)
        #expect(change?.title == nil)
    }

    @Test("a todo deleted after it was saved syncs as a delete (in memory)")
    @MainActor
    func deleteSyncsInMemory() async throws {
        let change = try await syncDeletedTodo(ModelConfiguration(isStoredInMemoryOnly: true))
        #expect(change?.deleted == true)
    }

    @Test("a store written with the old isDeleted attribute reads back")
    @MainActor
    func migratesOldAttribute() throws {
        let url = Self.storeURL()
        let deletedId: UUID
        do {
            let legacy = try ModelContainer(
                for: Schema([LegacyStore.TodoItem.self, LegacyStore.TodoUrl.self, TodoListModel.self]),
                configurations: [ModelConfiguration(url: url)]
            )
            let gone = LegacyStore.TodoItem(title: "Gone")
            gone.isDeleted = true
            let kept = LegacyStore.TodoItem(title: "Kept")
            legacy.mainContext.insert(gone)
            legacy.mainContext.insert(kept)
            try legacy.mainContext.save()
            deletedId = gone.id
        }

        let current = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(url: url)
        )
        let todos = try current.mainContext.fetch(FetchDescriptor<TodoItem>())
        #expect(todos.count == 2)
        #expect(todos.first { $0.id == deletedId }?.isSoftDeleted == true)
        #expect(todos.first { $0.id != deletedId }?.isSoftDeleted == false)
        let softDeleted = try current.mainContext.fetchCount(
            FetchDescriptor<TodoItem>(predicate: #Predicate { $0.isSoftDeleted })
        )
        #expect(softDeleted == 1)
    }
}

/// The models as main shipped them, with the attribute still named
/// `isDeleted`, to write a store the way an installed build did.
enum LegacyStore {
    @Model
    final class TodoItem {
        var id: UUID
        var userId: String?
        var parentId: UUID?
        var listKey: String?
        var listEnteredAt: Date?
        var title: String
        var itemNotes: String?
        var isCompleted: Bool
        var completedAt: Date?
        var createdAt: Date
        var updatedAt: Date
        var isSynced: Bool
        var isDeleted: Bool
        var position: String = "a0"
        var dueDate: Date?
        var recurrenceFrequency: String?
        @Attribute(originalName: "sticky") var pinned: Bool = false
        var pendingUrls: [String] = []
        @Relationship(deleteRule: .cascade) var urls: [LegacyStore.TodoUrl] = []

        init(title: String) {
            id = UUID()
            self.title = title
            isCompleted = false
            createdAt = Date()
            updatedAt = Date()
            isSynced = true
            isDeleted = false
        }
    }

    @Model
    final class TodoUrl {
        var id: String
        var url: String
        var title: String?
        var itemDescription: String?
        var siteName: String?
        var favicon: String?
        var image: String?
        var showPreview: Bool = true
        var position: String
        var fetchStatus: String
        var fetchedAt: Date?
        var createdAt: Date
        var updatedAt: Date
        @Relationship(inverse: \LegacyStore.TodoItem.urls) var todo: LegacyStore.TodoItem?

        init(id: String, url: String) {
            self.id = id
            self.url = url
            position = "a0"
            fetchStatus = "pending"
            createdAt = Date()
            updatedAt = Date()
        }
    }
}
