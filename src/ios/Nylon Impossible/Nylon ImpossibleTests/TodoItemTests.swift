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

    // MARK: - isAIProcessing

    @Test("isAIProcessing is false without a pending/processing status")
    func aiProcessingRequiresStatus() {
        let todo = TodoItem(title: "Test")
        todo.aiStatus = nil
        #expect(todo.isAIProcessing == false)

        todo.aiStatus = TodoAIStatus.complete.rawValue
        #expect(todo.isAIProcessing == false)
    }

    @Test("isAIProcessing uses aiStartedAt, not createdAt, for the time window")
    func aiProcessingWindowsOffStartedAt() {
        let todo = TodoItem(title: "Test")
        todo.aiStatus = TodoAIStatus.pending.rawValue

        // Created long ago (old flow would have expired the spinner)...
        todo.createdAt = Date(timeIntervalSinceNow: -600)
        // ...but enrichment only just started, so the spinner should be visible.
        todo.aiStartedAt = Date()
        #expect(todo.isAIProcessing == true)

        // A start time past the 60s window expires it (server never reported back).
        todo.aiStartedAt = Date(timeIntervalSinceNow: -120)
        #expect(todo.isAIProcessing == false)
    }

    @Test("isAIProcessing falls back to createdAt when aiStartedAt is unset")
    func aiProcessingFallsBackToCreatedAt() {
        let todo = TodoItem(title: "Test")
        todo.aiStatus = TodoAIStatus.processing.rawValue
        todo.aiStartedAt = nil

        // Fresh createdAt (server-driven status on a just-synced todo) → visible.
        #expect(todo.isAIProcessing == true)

        todo.createdAt = Date(timeIntervalSinceNow: -120)
        #expect(todo.isAIProcessing == false)
    }
}
