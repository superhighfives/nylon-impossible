import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("TodoListModel")
struct TodoListModelTests {
    private func systemList(_ kind: SystemListKind, name: String) -> TodoListModel {
        TodoListModel(id: kind.rawValue, userId: "u1", name: name, kind: "system", systemKind: kind)
    }

    @Test("an unrecognised system kind decodes to nil rather than trapping")
    func unknownSystemKindIsNil() {
        let list = TodoListModel(id: "l1", userId: "u1", name: "Completed", kind: "system")
        list.systemKindRaw = "completed"
        #expect(list.systemKind == nil)
        #expect(list.systemSortIndex == Int.max)
    }
}
