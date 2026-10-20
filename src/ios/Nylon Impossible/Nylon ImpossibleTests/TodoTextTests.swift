import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("TodoText (splitTodoText mirror and composer lines)")
struct TodoTextTests {
    @Test("short text passes through")
    func short() {
        #expect(TodoText.split("  Buy milk ") == TodoText.Split(title: "Buy milk", notes: nil))
    }

    @Test("multi-line text: first line titles, the rest is notes")
    func multiLine() {
        #expect(TodoText.split("Trip\nBook flights\nPack") == TodoText.Split(title: "Trip", notes: "Book flights\nPack"))
    }

    @Test("an overlong line is clipped, with the whole text kept in notes")
    func overflow() {
        let long = String(repeating: "word ", count: 150).trimmingCharacters(in: .whitespaces)
        let split = TodoText.split(long)
        #expect(split.notes == long)
        #expect(split.title.hasSuffix("…"))
        #expect(split.title.count <= 120)
    }

    @Test("an overlong bare URL is titled by its host")
    func longURL() {
        let url = "https://example.com/" + String(repeating: "a", count: 600)
        #expect(TodoText.split(url).title == "example.com")
    }

    @Test("the composer adds one todo per non-empty line")
    func composerLines() {
        let entries = TodoText.entries(fromDraft: "Parmesan\n\n  Coffee beans \nOat milk\n")
        #expect(entries.map(\.title) == ["Parmesan", "Coffee beans", "Oat milk"])
        #expect(entries.allSatisfy { $0.notes == nil })
    }
}
