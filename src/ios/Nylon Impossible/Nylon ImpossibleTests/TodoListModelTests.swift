import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("TodoListModel")
struct TodoListModelTests {
    private func systemList(_ kind: SystemListKind, name: String) -> TodoListModel {
        TodoListModel(id: kind.rawValue, userId: "u1", name: name, kind: "system", systemKind: kind)
    }

    @Test("the three time-based system lists each supply a prompt phrase")
    func promptPhraseForSystemLists() {
        #expect(systemList(.today, name: "Today").promptPhrase == "today")
        #expect(systemList(.thisWeek, name: "This Week").promptPhrase == "this week")
        #expect(systemList(.sometime, name: "Sometime").promptPhrase == "sometime")
    }

    @Test("custom lists have no prompt phrase")
    func promptPhraseForCustomList() {
        let list = TodoListModel(id: "l1", userId: "u1", name: "Groceries")
        #expect(list.promptPhrase == nil)
    }

    @Test("Completed has no prompt phrase")
    func promptPhraseForCompleted() {
        #expect(systemList(.completed, name: "Completed").promptPhrase == nil)
    }
}
