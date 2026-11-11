import Foundation
import SwiftUI
import Testing
@testable import Nylon_Impossible

@Suite("iPad board: key map")
struct BoardKeyMapTests {
    private func key(_ characters: String, _ modifiers: EventModifiers = []) -> BoardKey? {
        BoardKey.from(key: KeyEquivalent(Character(characters)), characters: characters, modifiers: modifiers)
    }

    @Test("Letters and digits map to the wide-web keys")
    func letters() {
        #expect(key("j") == .down)
        #expect(key("k") == .up)
        #expect(key("h") == .left)
        #expect(key("l") == .right)
        #expect(key("x") == .done)
        #expect(key("p") == .pin)
        #expect(key("d") == .due)
        #expect(key("n") == .new)
        #expect(key("1") == .move(.today))
        #expect(key("2") == .move(.thisWeek))
        #expect(key("3") == .move(.someday))
    }

    @Test("Shift doesn't change the meaning")
    func shifted() {
        #expect(BoardKey.from(key: "J", characters: "J", modifiers: .shift) == .down)
    }

    @Test("Arrows, Return and Delete")
    func specialKeys() {
        #expect(BoardKey.from(key: .downArrow, characters: "", modifiers: []) == .down)
        #expect(BoardKey.from(key: .upArrow, characters: "", modifiers: []) == .up)
        #expect(BoardKey.from(key: .leftArrow, characters: "", modifiers: []) == .left)
        #expect(BoardKey.from(key: .rightArrow, characters: "", modifiers: []) == .right)
        #expect(BoardKey.from(key: .return, characters: "\r", modifiers: []) == .open)
        #expect(BoardKey.from(key: .delete, characters: "", modifiers: []) == .delete)
        #expect(BoardKey.from(key: .deleteForward, characters: "", modifiers: []) == .delete)
    }

    @Test("Tab and ⇧Tab move between sections")
    func tab() {
        #expect(BoardKey.from(key: .tab, characters: "\t", modifiers: []) == .nextSection)
        #expect(BoardKey.from(key: .tab, characters: "\t", modifiers: .shift) == .previousSection)
        // The Mac can send ⇧Tab as a back-tab character.
        #expect(BoardKey.from(key: KeyEquivalent("\u{19}"), characters: "\u{19}", modifiers: .shift) == .previousSection)
        #expect(BoardKey.from(key: .tab, characters: "\t", modifiers: .control) == nil)
    }

    @Test("⌘, ⌃ and ⌥ presses are left for the system")
    func modified() {
        #expect(key("n", .command) == nil)
        #expect(key("j", .control) == nil)
        #expect(key("x", .option) == nil)
    }

    @Test("Other keys do nothing")
    func unmapped() {
        #expect(key("q") == nil)
        #expect(key("4") == nil)
    }
}

@Suite("iPad board: selection")
struct BoardNavigatorTests {
    private let a = UUID(), b = UUID(), c = UUID()

    @Test("Down starts at the top, up at the bottom")
    func start() {
        #expect(BoardNavigator.step([a, b, c], from: nil, by: 1) == a)
        #expect(BoardNavigator.step([a, b, c], from: nil, by: -1) == c)
    }

    @Test("Steps clamp at the ends")
    func clamps() {
        #expect(BoardNavigator.step([a, b, c], from: a, by: 1) == b)
        #expect(BoardNavigator.step([a, b, c], from: c, by: 1) == c)
        #expect(BoardNavigator.step([a, b, c], from: a, by: -1) == a)
    }

    @Test("An empty column has no selection")
    func empty() {
        #expect(BoardNavigator.step([], from: a, by: 1) == nil)
        #expect(BoardNavigator.across(from: [a], current: a, to: []) == nil)
    }

    @Test("A row that leaves hands the selection to the next, else the previous")
    func neighbor() {
        #expect(BoardNavigator.neighbor(of: a, in: [a, b, c]) == b)
        #expect(BoardNavigator.neighbor(of: c, in: [a, b, c]) == b)
        #expect(BoardNavigator.neighbor(of: a, in: [a]) == nil)
    }

    @Test("Done and Delete hand the selection on; a move keeps it, in the new column")
    func selectionAfter() {
        let gone = BoardNavigator.selection(after: .gone, of: a, in: "today", rows: [a, b, c])
        #expect(gone.todo == b)
        #expect(gone.column == "today")
        let last = BoardNavigator.selection(after: .gone, of: a, in: "today", rows: [a])
        #expect(last.todo == nil)

        let moved = BoardNavigator.selection(after: .moved(to: "week"), of: a, in: "today", rows: [a, b, c])
        #expect(moved.todo == a)
        #expect(moved.column == "week")
    }

    @Test("Across columns keeps the position where it can")
    func across() {
        let x = UUID(), y = UUID()
        #expect(BoardNavigator.across(from: [a, b, c], current: b, to: [x, y]) == y)
        #expect(BoardNavigator.across(from: [a, b, c], current: c, to: [x, y]) == y)
        #expect(BoardNavigator.across(from: [a, b, c], current: nil, to: [x, y]) == x)
    }

    @Test("Columns clamp")
    func columns() {
        #expect(BoardNavigator.column(0, by: -1, count: 4) == 0)
        #expect(BoardNavigator.column(3, by: 1, count: 4) == 3)
        #expect(BoardNavigator.column(1, by: 1, count: 4) == 2)
    }
}

@Suite("Board: sections")
struct BoardSectionsTests {
    private let today = "today", week = "week", someday = "someday", done = "done"
    private var columns: [String] { [today, week, someday, done] }
    private var order: [BoardSection] { BoardSections.order(columns: columns, hasDetail: false) }
    private var orderWithDetail: [BoardSection] {
        BoardSections.order(columns: [today, week, someday], hasDetail: true)
    }

    @Test("Tab order: the sidebar, the columns, then the open todo")
    func tabOrder() {
        #expect(order == [.sidebar, .column(today), .column(week), .column(someday), .column(done)])
        #expect(orderWithDetail == [.sidebar, .column(today), .column(week), .column(someday), .detail])
    }

    @Test("Tab six times comes back round, and ⇧Tab retraces it")
    func tabWraps() {
        var section = BoardSection.sidebar
        var visited: [BoardSection] = []
        for _ in 0..<6 {
            section = BoardSections.cycle(section, by: 1, in: order)
            visited.append(section)
        }
        #expect(visited == [.column(today), .column(week), .column(someday), .column(done), .sidebar, .column(today)])
        var back: [BoardSection] = []
        for _ in 0..<6 {
            section = BoardSections.cycle(section, by: -1, in: order)
            back.append(section)
        }
        #expect(back == [.sidebar, .column(done), .column(someday), .column(week), .column(today), .sidebar])
        #expect(BoardSections.cycle(.detail, by: 1, in: orderWithDetail) == .sidebar)
    }

    @Test("← → on a section move to the adjacent one and stop at the ends")
    func adjacent() {
        #expect(BoardSections.onSection(.left, section: .column(today), order: order) == .section(.sidebar))
        #expect(BoardSections.onSection(.right, section: .sidebar, order: order) == .section(.column(today)))
        #expect(BoardSections.onSection(.left, section: .sidebar, order: order) == .section(.sidebar))
        #expect(BoardSections.onSection(.right, section: .column(done), order: order) == .section(.column(done)))
        #expect(BoardSections.onSection(.right, section: .column(someday), order: orderWithDetail) == .section(.detail))
    }

    @Test("← from This week lands on Today, whether or not Today has todos")
    func leftIntoAnEmptyToday() {
        // Sections don't depend on rows: an empty Today is still a section.
        #expect(BoardSections.onSection(.left, section: .column(week), order: order) == .section(.column(today)))
    }

    @Test("Return steps in; Esc on a column goes to the sidebar, on the open todo closes it")
    func returnAndEscape() {
        #expect(BoardSections.onSection(.open, section: .column(week), order: order) == .stepIn)
        #expect(BoardSections.onSection(.open, section: .sidebar, order: order) == .stepIn)
        #expect(BoardSections.onSection(.back, section: .column(week), order: order) == .sidebar(column: week))
        #expect(BoardSections.onSection(.back, section: .column(done), order: order) == .sidebar(column: done))
        #expect(BoardSections.onSection(.back, section: .sidebar, order: order) == .none)
        #expect(BoardSections.onSection(.back, section: .detail, order: orderWithDetail) == .closeDetail)
        // Row keys aren't the section's to handle.
        #expect(BoardSections.onSection(.done, section: .column(today), order: order) == .none)
    }

    @Test("n types in the column's Add; the sidebar, Done and the open todo get quick add")
    func newTodo() {
        #expect(BoardSections.addColumn(for: .column(today), done: done) == today)
        #expect(BoardSections.addColumn(for: .column("groceries"), done: done) == "groceries")
        #expect(BoardSections.addColumn(for: .column(done), done: done) == nil)
        #expect(BoardSections.addColumn(for: .sidebar, done: done) == nil)
        #expect(BoardSections.addColumn(for: .detail, done: done) == nil)
    }
}

@Suite("Board: inside a column")
struct ColumnSpotTests {
    private let a = UUID(), b = UUID()

    @Test("Return selects the first todo, else Add, else nothing")
    func stepIn() {
        #expect(BoardSections.stepIn(rows: [a, b], hasAdd: true) == .row(a))
        #expect(BoardSections.stepIn(rows: [], hasAdd: true) == .add)
        #expect(BoardSections.stepIn(rows: [], hasAdd: false) == nil)
        #expect(BoardSections.stepIn(rows: [a], hasAdd: false) == .row(a))
    }

    @Test("Add sits above the first todo")
    func addAndRows() {
        #expect(BoardSections.vertical(rows: [a, b], from: .add, by: 1, hasAdd: true) == .row(a))
        #expect(BoardSections.vertical(rows: [a, b], from: .row(a), by: -1, hasAdd: true) == .add)
        #expect(BoardSections.vertical(rows: [a, b], from: .add, by: -1, hasAdd: true) == .add)
        #expect(BoardSections.vertical(rows: [], from: .add, by: 1, hasAdd: true) == .add)
        #expect(BoardSections.vertical(rows: [a, b], from: .row(a), by: 1, hasAdd: true) == .row(b))
        #expect(BoardSections.vertical(rows: [a, b], from: .row(b), by: 1, hasAdd: true) == .row(b))
        // Done has no Add: ↑ from its first todo stays put.
        #expect(BoardSections.vertical(rows: [a, b], from: .row(a), by: -1, hasAdd: false) == .row(a))
    }
}

@Suite("Board: across columns")
struct AcrossMoveTests {
    private let today = "today", week = "week", done = "done"
    private let a = UUID(), b = UUID(), c = UUID(), d = UUID()
    private var columns: [String] { [today, week, done] }

    private func move(
        from column: String, at spot: ColumnSpot, by offset: Int,
        rows: [String: [UUID]], hasDetail: Bool = false
    ) -> AcrossMove {
        let board = KeyBoard(columns: columns, rows: { rows[$0] ?? [] }, done: done, hasDetail: hasDetail)
        return BoardSections.across(from: column, at: spot, by: offset, in: board)
    }

    @Test("A row keeps its position, or the last row of a shorter column")
    func rowKeepsPosition() {
        let rows = [today: [a, b], week: [c, d]]
        #expect(move(from: today, at: .row(b), by: 1, rows: rows) == .column(week, .row(d)))
        #expect(move(from: week, at: .row(c), by: -1, rows: rows) == .column(today, .row(a)))
        #expect(move(from: today, at: .row(b), by: 1, rows: [today: [a, b], week: [c]]) == .column(week, .row(c)))
    }

    @Test("Into an empty column: its Add, or the column itself for an empty Done")
    func intoAnEmptyColumn() {
        #expect(move(from: today, at: .row(a), by: 1, rows: [today: [a]]) == .column(week, .add))
        #expect(move(from: week, at: .row(a), by: 1, rows: [week: [a]]) == .column(done, nil))
    }

    @Test("Add goes to Add; Done has none, so its first todo")
    func addToAdd() {
        #expect(move(from: today, at: .add, by: 1, rows: [week: [c]]) == .column(week, .add))
        #expect(move(from: week, at: .add, by: 1, rows: [done: [d]]) == .column(done, .row(d)))
        #expect(move(from: week, at: .add, by: 1, rows: [:]) == .column(done, nil))
    }

    @Test("← from the first column enters the sidebar; → from the last reaches the open todo")
    func ends() {
        let rows = [today: [a], done: [d]]
        #expect(move(from: today, at: .row(a), by: -1, rows: rows) == .sidebar(column: today))
        #expect(move(from: done, at: .row(d), by: 1, rows: rows) == .none)
        #expect(move(from: done, at: .row(d), by: 1, rows: rows, hasDetail: true) == .detail)
        #expect(move(from: "gone", at: .add, by: 1, rows: rows) == .none)
    }
}
