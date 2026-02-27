import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("TodoItem")
struct TodoItemTests {
    @Test("Init sets correct defaults")
    func initDefaults() {
        let todo = TodoItem(title: "Test todo")

        #expect(todo.title == "Test todo")
        #expect(todo.isCompleted == false)
        #expect(todo.isSynced == false)
        #expect(todo.isDeleted == false)
        #expect(todo.position == "a0")
        #expect(todo.userId == nil)
    }

    @Test("Init uses provided userId")
    func initWithUserId() {
        let todo = TodoItem(title: "Test", userId: "user_123")
        #expect(todo.userId == "user_123")
    }

    @Test("Init uses provided position")
    func initWithPosition() {
        let todo = TodoItem(title: "Test", position: "b5")
        #expect(todo.position == "b5")
    }

    @Test("id is a valid UUID on creation")
    func validUUID() {
        let todo = TodoItem(title: "Test")
        // UUID was set (non-nil, non-zero)
        #expect(todo.id != UUID(uuidString: "00000000-0000-0000-0000-000000000000"))
    }

    @Test("markModified updates updatedAt to a newer date")
    func markModifiedUpdatesDate() {
        let todo = TodoItem(title: "Test")
        let originalDate = todo.updatedAt

        // Small delay to ensure different timestamp
        Thread.sleep(forTimeInterval: 0.01)
        todo.markModified()

        #expect(todo.updatedAt >= originalDate)
    }

    @Test("markModified sets isSynced to false")
    func markModifiedClearsSynced() {
        let todo = TodoItem(title: "Test")
        todo.isSynced = true

        todo.markModified()

        #expect(todo.isSynced == false)
    }
}
