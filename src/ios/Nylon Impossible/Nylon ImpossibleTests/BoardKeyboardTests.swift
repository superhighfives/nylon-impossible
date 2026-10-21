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
