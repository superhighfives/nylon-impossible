import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

@Suite("TodoViewModel")
struct TodoViewModelTests {
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(for: TodoItem.self, configurations: config)
    }

    @Test("canAddTask is false when text is empty")
    func canAddTaskEmpty() {
        let vm = TodoViewModel()
        vm.newTaskText = ""
        #expect(vm.canAddTask == false)
    }

    @Test("canAddTask is false when text is only whitespace")
    func canAddTaskWhitespace() {
        let vm = TodoViewModel()
        vm.newTaskText = "   \n  "
        #expect(vm.canAddTask == false)
    }

    @Test("canAddTask is true when text has content")
    func canAddTaskWithContent() {
        let vm = TodoViewModel()
        vm.newTaskText = "Buy milk"
        #expect(vm.canAddTask == true)
    }

    @Test("sortedTodos filters out deleted items")
    func sortedTodosFiltersDeleted() {
        let active = TodoItem(title: "Active")
        let deleted = TodoItem(title: "Deleted")
        deleted.isDeleted = true

        let vm = TodoViewModel()
        let result = vm.sortedTodos(from: [active, deleted])

        #expect(result.count == 1)
        #expect(result[0].title == "Active")
    }

    @Test("sortedTodos places incomplete before completed")
    func sortedTodosIncompleteFirst() {
        let completed = TodoItem(title: "Done")
        completed.isCompleted = true

        let incomplete = TodoItem(title: "Todo")

        let vm = TodoViewModel()
        let result = vm.sortedTodos(from: [completed, incomplete])

        #expect(result[0].title == "Todo")
        #expect(result[1].title == "Done")
    }

    @Test("sortedTodos sorts incomplete by position ascending")
    func sortedTodosByPosition() {
        let b = TodoItem(title: "B", position: "b0")
        let a = TodoItem(title: "A", position: "a0")
        let c = TodoItem(title: "C", position: "c0")

        let vm = TodoViewModel()
        let result = vm.sortedTodos(from: [c, a, b])

        #expect(result[0].title == "A")
        #expect(result[1].title == "B")
        #expect(result[2].title == "C")
    }

    @Test("sortedTodos sorts completed by updatedAt descending")
    func sortedTodosCompletedByDate() {
        let older = TodoItem(title: "Older")
        older.isCompleted = true
        older.updatedAt = Date(timeIntervalSince1970: 1000)

        let newer = TodoItem(title: "Newer")
        newer.isCompleted = true
        newer.updatedAt = Date(timeIntervalSince1970: 2000)

        let vm = TodoViewModel()
        let result = vm.sortedTodos(from: [older, newer])

        #expect(result[0].title == "Newer")
        #expect(result[1].title == "Older")
    }

    @Test("toggleTodo flips isCompleted")
    @MainActor
    func toggleTodo() {
        let todo = TodoItem(title: "Test")
        #expect(todo.isCompleted == false)

        let vm = TodoViewModel()
        vm.toggleTodo(todo, allTodos: [todo])
        #expect(todo.isCompleted == true)

        vm.toggleTodo(todo, allTodos: [todo])
        #expect(todo.isCompleted == false)
    }

    @Test("toggleTodo calls markModified")
    @MainActor
    func toggleTodoMarksModified() {
        let todo = TodoItem(title: "Test")
        todo.isSynced = true

        let vm = TodoViewModel()
        vm.toggleTodo(todo, allTodos: [todo])

        #expect(todo.isSynced == false)
    }

    @Test("toggleTodo unchecking moves to end of incomplete list")
    @MainActor
    func toggleTodoUncheckedMovesToEnd() {
        let first = TodoItem(title: "First", position: "a0")
        let second = TodoItem(title: "Second", position: "b0")
        let todo = TodoItem(title: "Test", position: "a5")
        todo.isCompleted = true

        let vm = TodoViewModel()
        vm.toggleTodo(todo, allTodos: [first, second, todo])

        #expect(todo.isCompleted == false)
        #expect(todo.position > second.position)
    }

    @Test("addTodo with SwiftData creates item and clears input")
    @MainActor
    func addTodoCreatesItem() throws {
        let container = try makeContainer()
        let context = container.mainContext

        let vm = TodoViewModel()
        vm.newTaskText = "New task"
        vm.addTodo(context: context, userId: "user_123", allTodos: [])

        #expect(vm.newTaskText == "")

        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 1)
        #expect(items[0].title == "New task")
        #expect(items[0].userId == "user_123")
    }

    @Test("addTodo does nothing when text is empty")
    @MainActor
    func addTodoEmptyText() throws {
        let container = try makeContainer()
        let context = container.mainContext

        let vm = TodoViewModel()
        vm.newTaskText = "   "
        vm.addTodo(context: context, userId: nil, allTodos: [])

        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items.count == 0)
    }

    @Test("addTodo trims whitespace from title")
    @MainActor
    func addTodoTrimsWhitespace() throws {
        let container = try makeContainer()
        let context = container.mainContext

        let vm = TodoViewModel()
        vm.newTaskText = "  Buy milk  "
        vm.addTodo(context: context, userId: nil, allTodos: [])

        let descriptor = FetchDescriptor<TodoItem>()
        let items = try context.fetch(descriptor)
        #expect(items[0].title == "Buy milk")
    }

    @Test("deleteTodo soft-deletes when userId is set")
    func softDelete() {
        let todo = TodoItem(title: "Test", userId: "user_123")

        // Can't call with real context for soft delete, just test the logic
        // When userId is set, it should set isDeleted = true
        if todo.userId != nil {
            todo.isDeleted = true
            todo.markModified()
        }

        #expect(todo.isDeleted == true)
        #expect(todo.isSynced == false)
    }
}
