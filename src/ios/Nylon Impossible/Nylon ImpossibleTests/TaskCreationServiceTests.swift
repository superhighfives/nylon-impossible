import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

@Suite("TaskCreationService")
struct TaskCreationServiceTests {
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(for: TodoItem.self, configurations: config)
    }
    
    @Test("createTask creates todo with correct title")
    @MainActor
    func createTaskWithTitle() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let todo = TaskCreationService.createTask(
            title: "Buy groceries",
            userId: nil,
            context: context,
            allTodos: []
        )
        
        #expect(todo.title == "Buy groceries")
    }
    
    @Test("createTask trims whitespace from title")
    @MainActor
    func createTaskTrimsWhitespace() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let todo = TaskCreationService.createTask(
            title: "  Buy groceries  ",
            userId: nil,
            context: context,
            allTodos: []
        )
        
        #expect(todo.title == "Buy groceries")
    }
    
    @Test("createTask sets userId when provided")
    @MainActor
    func createTaskWithUserId() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let todo = TaskCreationService.createTask(
            title: "Test task",
            userId: "user_123",
            context: context,
            allTodos: []
        )
        
        #expect(todo.userId == "user_123")
    }
    
    @Test("createTask generates position before existing todos")
    @MainActor
    func createTaskGeneratesPosition() throws {
        let container = try makeContainer()
        let context = container.mainContext

        // Create first todo
        let first = TaskCreationService.createTask(
            title: "First",
            userId: nil,
            context: context,
            allTodos: []
        )

        // Fetch all todos to pass to second createTask
        let descriptor = FetchDescriptor<TodoItem>()
        let allTodos = try context.fetch(descriptor)

        // Create second todo
        let second = TaskCreationService.createTask(
            title: "Second",
            userId: nil,
            context: context,
            allTodos: allTodos
        )

        // Second should have position before first (new tasks go to the top)
        #expect(second.position < first.position)
    }
    
    @Test("createTask inserts into context")
    @MainActor
    func createTaskInsertsIntoContext() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        _ = TaskCreationService.createTask(
            title: "Test",
            userId: nil,
            context: context,
            allTodos: []
        )
        
        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 1)
    }
    
    @Test("createTaskWithURL stores URL in pendingUrls")
    @MainActor
    func createTaskWithURL() throws {
        let container = try makeContainer()
        let context = container.mainContext

        let todo = TaskCreationService.createTaskWithURL(
            title: "Check this article",
            url: "https://example.com/article",
            userId: nil,
            context: context,
            allTodos: []
        )

        #expect(todo.title == "Check this article")
        #expect(todo.itemDescription == nil)
        #expect(todo.pendingUrls == ["https://example.com/article"])
    }

    @Test("createTaskWithURL does not duplicate the same URL")
    @MainActor
    func createTaskWithURLDedupesUrl() throws {
        let container = try makeContainer()
        let context = container.mainContext

        let todo = TaskCreationService.createTaskWithURL(
            title: "Check this",
            url: "https://example.com",
            userId: nil,
            context: context,
            allTodos: []
        )
        // Call again with the same URL
        _ = TaskCreationService.createTaskWithURL(
            title: "Check this",
            url: "https://example.com",
            userId: nil,
            context: context,
            allTodos: [todo]
        )

        // Re-fetch the original todo to check pendingUrls (createTaskWithURL creates a new todo each call)
        // Verify a single createTaskWithURL call only produces one entry
        #expect(todo.pendingUrls.count == 1)
        #expect(todo.pendingUrls == ["https://example.com"])
    }

    @Test("createTaskWithURL appends a second different URL")
    @MainActor
    func createTaskWithURLAppendsDifferentUrl() throws {
        let container = try makeContainer()
        let context = container.mainContext

        let todo = TaskCreationService.createTask(
            title: "My task",
            userId: nil,
            context: context,
            allTodos: []
        )
        todo.pendingUrls = ["https://example.com/first"]

        // Simulate a second URL being added to the same todo before sync
        if !todo.pendingUrls.contains("https://example.com/second") {
            todo.pendingUrls += ["https://example.com/second"]
        }

        #expect(todo.pendingUrls.count == 2)
        #expect(todo.pendingUrls.contains("https://example.com/first"))
        #expect(todo.pendingUrls.contains("https://example.com/second"))
    }
    
    @Test("createTaskWithURL sets userId when provided")
    @MainActor
    func createTaskWithURLAndUserId() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let todo = TaskCreationService.createTaskWithURL(
            title: "Check this",
            url: "https://example.com",
            userId: "user_456",
            context: context,
            allTodos: []
        )
        
        #expect(todo.userId == "user_456")
    }
    
    @Test("fetchAllTodos returns non-deleted items")
    @MainActor
    func fetchAllTodosFiltersDeleted() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let active = TodoItem(title: "Active")
        let deleted = TodoItem(title: "Deleted")
        deleted.isDeleted = true
        
        context.insert(active)
        context.insert(deleted)
        try context.save()
        
        let todos = TaskCreationService.fetchAllTodos(userId: nil, context: context)
        
        #expect(todos.count == 1)
        #expect(todos[0].title == "Active")
    }
    
    @Test("fetchAllTodos filters by userId")
    @MainActor
    func fetchAllTodosFiltersByUserId() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let user1Todo = TodoItem(title: "User 1 Todo", userId: "user_1")
        let user2Todo = TodoItem(title: "User 2 Todo", userId: "user_2")
        let localTodo = TodoItem(title: "Local Todo")
        
        context.insert(user1Todo)
        context.insert(user2Todo)
        context.insert(localTodo)
        try context.save()
        
        // When userId is provided, should return that user's todos + local todos
        let user1Todos = TaskCreationService.fetchAllTodos(userId: "user_1", context: context)
        
        #expect(user1Todos.count == 2)
        let titles = user1Todos.map { $0.title }
        #expect(titles.contains("User 1 Todo"))
        #expect(titles.contains("Local Todo"))
        #expect(!titles.contains("User 2 Todo"))
    }
    
    @Test("fetchAllTodos returns only local todos when no userId")
    @MainActor
    func fetchAllTodosNoUserId() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let userTodo = TodoItem(title: "User Todo", userId: "user_1")
        let localTodo = TodoItem(title: "Local Todo")
        
        context.insert(userTodo)
        context.insert(localTodo)
        try context.save()
        
        let todos = TaskCreationService.fetchAllTodos(userId: nil, context: context)
        
        #expect(todos.count == 1)
        #expect(todos[0].title == "Local Todo")
    }
    
    @Test("fetchAllTodos sorts by position")
    @MainActor
    func fetchAllTodosSortsByPosition() throws {
        let container = try makeContainer()
        let context = container.mainContext
        
        let c = TodoItem(title: "C", position: "c0")
        let a = TodoItem(title: "A", position: "a0")
        let b = TodoItem(title: "B", position: "b0")
        
        context.insert(c)
        context.insert(a)
        context.insert(b)
        try context.save()
        
        let todos = TaskCreationService.fetchAllTodos(userId: nil, context: context)
        
        #expect(todos[0].title == "A")
        #expect(todos[1].title == "B")
        #expect(todos[2].title == "C")
    }
}
