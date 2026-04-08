import Testing
@testable import Nylon_Impossible

@Suite("TodoShareHelper")
struct TodoShareHelperTests {
    // MARK: - Title only

    @Test("Title only when notes, dueDate, and urls are all empty/nil")
    func titleOnly() {
        let todo = TodoItem(title: "Buy groceries")
        let result = shareText(for: todo, urls: [])
        #expect(result == "Buy groceries")
    }

    // MARK: - Notes

    @Test("Includes notes when present")
    func withNotes() {
        let todo = TodoItem(title: "Buy groceries")
        todo.itemNotes = "Milk, eggs, bread"
        let result = shareText(for: todo, urls: [])
        #expect(result == "Buy groceries\nMilk, eggs, bread")
    }

    @Test("Excludes notes when empty string")
    func emptyNotes() {
        let todo = TodoItem(title: "Buy groceries")
        todo.itemNotes = ""
        let result = shareText(for: todo, urls: [])
        #expect(result == "Buy groceries")
    }

    // MARK: - Due date

    @Test("Includes formatted due date when set")
    func withDueDate() {
        let todo = TodoItem(title: "Submit report")
        // Use a fixed date: 2026-06-15
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = 15
        let date = Calendar.current.date(from: components)!
        todo.dueDate = date
        let result = shareText(for: todo, urls: [])
        #expect(result.hasPrefix("Submit report\nDue: "))
        #expect(result.contains("2026"))
    }

    @Test("Excludes due date when nil")
    func noDueDate() {
        let todo = TodoItem(title: "Submit report")
        todo.dueDate = nil
        let result = shareText(for: todo, urls: [])
        #expect(!result.contains("Due:"))
    }

    // MARK: - URLs

    @Test("Includes URLs when present")
    func withUrls() {
        let todo = TodoItem(title: "Read article")
        let url = APITodoUrl(
            id: "1", todoId: "t1", url: "https://example.com",
            title: nil, description: nil, siteName: nil, favicon: nil,
            position: "a0", fetchStatus: .fetched, fetchedAt: nil,
            createdAt: Date(), updatedAt: Date()
        )
        let result = shareText(for: todo, urls: [url])
        #expect(result == "Read article\nhttps://example.com")
    }

    @Test("Includes multiple URLs")
    func withMultipleUrls() {
        let todo = TodoItem(title: "Research")
        let urls = [
            APITodoUrl(
                id: "1", todoId: "t1", url: "https://example.com",
                title: nil, description: nil, siteName: nil, favicon: nil,
                position: "a0", fetchStatus: .fetched, fetchedAt: nil,
                createdAt: Date(), updatedAt: Date()
            ),
            APITodoUrl(
                id: "2", todoId: "t1", url: "https://other.com",
                title: nil, description: nil, siteName: nil, favicon: nil,
                position: "a1", fetchStatus: .fetched, fetchedAt: nil,
                createdAt: Date(), updatedAt: Date()
            ),
        ]
        let result = shareText(for: todo, urls: urls)
        #expect(result == "Research\nhttps://example.com\nhttps://other.com")
    }

    // MARK: - All fields

    @Test("Includes all fields in correct order: title, notes, due date, urls")
    func allFields() {
        let todo = TodoItem(title: "Plan trip")
        todo.itemNotes = "Book flights"
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = 15
        todo.dueDate = Calendar.current.date(from: components)!
        let url = APITodoUrl(
            id: "1", todoId: "t1", url: "https://flights.example.com",
            title: nil, description: nil, siteName: nil, favicon: nil,
            position: "a0", fetchStatus: .fetched, fetchedAt: nil,
            createdAt: Date(), updatedAt: Date()
        )
        let result = shareText(for: todo, urls: [url])
        let lines = result.components(separatedBy: "\n")
        #expect(lines.count == 4)
        #expect(lines[0] == "Plan trip")
        #expect(lines[1] == "Book flights")
        #expect(lines[2].hasPrefix("Due: "))
        #expect(lines[3] == "https://flights.example.com")
    }
}
