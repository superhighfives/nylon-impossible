import Foundation
import Testing
@testable import Nylon_Impossible

@MainActor
@Suite("Move to menu plan")
struct MoveMenuPlanTests {
    private let today = TodoListModel(id: "today", userId: "u", name: "Today", kind: "system", systemKind: .today)
    private let week = TodoListModel(id: "thisweek", userId: "u", name: "This week", kind: "system", systemKind: .thisWeek)
    private let someday = TodoListModel(id: "someday", userId: "u", name: "Someday", kind: "system", systemKind: .someday)
    private let a = TodoListModel(id: "a", userId: "u", name: "A", position: "a0")
    private let b = TodoListModel(id: "b", userId: "u", name: "B", position: "a1")
    private let c = TodoListModel(id: "c", userId: "u", name: "C", position: "a2")
    private let d = TodoListModel(id: "d", userId: "u", name: "D", position: "a3")

    @Test("arrows point the way the lists lie")
    func arrows() {
        #expect(MoveMenuPlan.arrow(to: today, from: week) == "arrow.left")
        #expect(MoveMenuPlan.arrow(to: someday, from: week) == "arrow.right")
        #expect(MoveMenuPlan.arrow(to: week, from: today) == "arrow.right")
        #expect(MoveMenuPlan.arrow(to: week, from: someday) == "arrow.left")
        #expect(MoveMenuPlan.arrow(to: today, from: a) == "arrow.right")
    }

    @Test("the two most recent collections lead, the rest go under More")
    func recents() {
        let plan = MoveMenuPlan(others: [today, someday, a, b, c, d], recentIds: ["D", "x", "b", "c"])
        #expect(plan.timeLists.map(\.id) == ["today", "someday"])
        #expect(plan.recent.map(\.id) == ["d", "b"])
        #expect(plan.more.map(\.id) == ["a", "c"])
    }

    @Test("with no history the first collections fill in")
    func noHistory() {
        let plan = MoveMenuPlan(others: [today, a, b, c], recentIds: [])
        #expect(plan.recent.map(\.id) == ["a", "b"])
        #expect(plan.more.map(\.id) == ["c"])
        #expect(MoveMenuPlan(others: [today, a], recentIds: []).more.isEmpty)
    }

    @Test("recording a move puts it first and keeps one copy")
    func recording() throws {
        let defaults = try #require(UserDefaults(suiteName: "MoveMenuPlanTests"))
        defaults.removePersistentDomain(forName: "MoveMenuPlanTests")
        let recents = RecentMoveLists(defaults: defaults)
        recents.record("a")
        recents.record("b")
        recents.record("A")
        #expect(recents.ids == ["A", "b"])
    }
}
