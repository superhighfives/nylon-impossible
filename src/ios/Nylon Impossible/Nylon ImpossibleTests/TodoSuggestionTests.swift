import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("TodoSuggestion")
struct TodoSuggestionTests {
    @Test("isPending reflects status")
    func isPendingReflectsStatus() {
        let pending = TodoSuggestion(
            id: "s1", type: "title", label: "Rename", status: "pending",
            createdAt: Date(), updatedAt: Date()
        )
        let accepted = TodoSuggestion(
            id: "s2", type: "title", label: "Rename", status: "accepted",
            createdAt: Date(), updatedAt: Date()
        )
        #expect(pending.isPending == true)
        #expect(accepted.isPending == false)
    }

    @Test("applyLocally sets the title for a title suggestion")
    func applyLocallyTitle() {
        let todo = TodoItem(title: "buy milk https://example.com")
        let suggestion = TodoSuggestion(
            id: "s1", type: "title", label: "Rename",
            status: "pending", createdAt: Date(), updatedAt: Date(),
            payloadTitle: "buy milk"
        )

        suggestion.applyLocally(to: todo)

        #expect(todo.title == "buy milk")
    }

    @Test("applyLocally sets the due date for a due_date suggestion")
    func applyLocallyDueDate() {
        let todo = TodoItem(title: "Book DMV appointment")
        let suggestion = TodoSuggestion(
            id: "s1", type: "due_date", label: "Set due date",
            status: "pending", createdAt: Date(), updatedAt: Date(),
            payloadDueDate: "2026-07-25"
        )

        suggestion.applyLocally(to: todo)

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        #expect(todo.dueDate == formatter.date(from: "2026-07-25"))
    }

    @Test("applyLocally sets recurrence for a recurrence suggestion")
    func applyLocallyRecurrence() {
        let todo = TodoItem(title: "Take out trash")
        let suggestion = TodoSuggestion(
            id: "s1", type: "recurrence", label: "Repeat weekly",
            status: "pending", createdAt: Date(), updatedAt: Date(),
            payloadRecurrenceFrequency: "weekly"
        )

        suggestion.applyLocally(to: todo)

        #expect(todo.recurrence?.frequency == .weekly)
    }

    @Test("applyLocally is a no-op for subtasks and research suggestions")
    func applyLocallyNoOpForRowCreatingTypes() {
        let todo = TodoItem(title: "Plan birthday party")
        let originalTitle = todo.title
        let originalDueDate = todo.dueDate

        let subtasks = TodoSuggestion(
            id: "s1", type: "subtasks", label: "Add subtasks",
            status: "pending", createdAt: Date(), updatedAt: Date(),
            payloadTitles: ["Book venue", "Send invites"]
        )
        subtasks.applyLocally(to: todo)

        let research = TodoSuggestion(
            id: "s2", type: "research", label: "Research this",
            status: "pending", createdAt: Date(), updatedAt: Date(),
            payloadSearchQuery: "birthday party ideas", payloadResearchType: "general"
        )
        research.applyLocally(to: todo)

        #expect(todo.title == originalTitle)
        #expect(todo.dueDate == originalDueDate)
    }

    @Test("from(api:) copies fields including type-specific payload values")
    func fromAPICopiesFields() {
        let api = APITodoSuggestion(
            id: "s1",
            todoId: "t1",
            type: "due_date",
            payload: APISuggestionPayload(
                dueDate: "2026-07-25",
                recurrence: nil,
                title: nil,
                titles: nil,
                searchQuery: nil,
                researchType: nil
            ),
            label: "Set due date to Fri 25 Jul",
            status: "pending",
            createdAt: Date(timeIntervalSince1970: 1700000000),
            updatedAt: Date(timeIntervalSince1970: 1700000000)
        )

        let suggestion = TodoSuggestion(from: api)

        #expect(suggestion.id == "s1")
        #expect(suggestion.type == "due_date")
        #expect(suggestion.label == "Set due date to Fri 25 Jul")
        #expect(suggestion.status == "pending")
        #expect(suggestion.payloadDueDate == "2026-07-25")
    }
}
