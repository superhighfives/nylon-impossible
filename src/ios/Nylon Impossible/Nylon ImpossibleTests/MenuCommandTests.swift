//
//  MenuCommandTests.swift
//  Nylon ImpossibleTests
//
//  The board's menu commands: the keys the Mac's File, View and Todo menus
//  show, which of them are single keys (bound only while no field is being
//  edited), what needs a selected row, and how a command reaches the board —
//  a board key through `perform`, everything else through `run`. Plus the
//  undo history that puts the last 20 actions on ⌘Z and ⇧⌘Z.
//

import Foundation
import SwiftUI
import Testing
@testable import Nylon_Impossible

@Suite("Menu command routing")
@MainActor
struct MenuCommandTests {
    private final class Recorder {
        var keys: [BoardKey] = []
        var commands: [BoardMenuCommand] = []
    }

    private func handler(_ recorder: Recorder, keysEnabled: Bool = true, hasSelection: Bool = false) -> BoardCommandHandler {
        BoardCommandHandler(
            keysEnabled: keysEnabled,
            hasSelection: hasSelection,
            collections: [(id: "groceries", name: "Groceries")],
            focusedListName: "Today",
            perform: { recorder.keys.append($0) },
            run: { recorder.commands.append($0) }
        )
    }

    @Test("File, View and Todo carry the spec's shortcuts")
    func shortcuts() {
        typealias Shortcut = BoardMenuCommand.Shortcut
        #expect(BoardMenuCommand.newTodo.shortcut == Shortcut(key: "n", modifiers: .command))
        #expect(BoardMenuCommand.newList.shortcut == Shortcut(key: "n", modifiers: [.command, .shift]))
        #expect(BoardMenuCommand.showList(.today).shortcut == Shortcut(key: "1", modifiers: .command))
        #expect(BoardMenuCommand.showList(.thisWeek).shortcut == Shortcut(key: "2", modifiers: .command))
        #expect(BoardMenuCommand.showList(.someday).shortcut == Shortcut(key: "3", modifiers: .command))
        #expect(BoardMenuCommand.showDone.shortcut == Shortcut(key: "d", modifiers: [.command, .shift]))
        #expect(BoardMenuCommand.key(.done).shortcut == Shortcut(key: "x", modifiers: []))
        #expect(BoardMenuCommand.key(.pin).shortcut == Shortcut(key: "p", modifiers: []))
        #expect(BoardMenuCommand.key(.due).shortcut == Shortcut(key: "d", modifiers: []))
        #expect(BoardMenuCommand.key(.move(.thisWeek)).shortcut == Shortcut(key: "2", modifiers: []))
        #expect(BoardMenuCommand.key(.delete).shortcut == Shortcut(key: .delete, modifiers: []))
    }

    @Test("Titles use the app's words")
    func titles() {
        #expect(BoardMenuCommand.newTodo.title == "New todo")
        #expect(BoardMenuCommand.newList.title == "New list")
        #expect(BoardMenuCommand.showList(.thisWeek).title == "This week")
        #expect(BoardMenuCommand.key(.done).title == "Mark done")
        #expect(BoardMenuCommand.key(.due).title == "Due…")
        #expect(BoardMenuCommand.moveMenu.map(\.submenuTitle) == ["Today", "This week", "Someday"])
        #expect(BoardMenuCommand.key(.move(.thisWeek)).title == "Move to This week")
        #expect(BoardMenuCommand.key(.moveTo).title == "Move to a list…")
        #expect(BoardMenuCommand.search.title == "Search and commands")
    }

    @Test("Only the board's own keys are single keys")
    func singleKeys() {
        for command in BoardMenuCommand.todoMenu.compactMap({ $0 }) + BoardMenuCommand.moveMenu where command != .search {
            #expect(command.isSingleKey, "\(command.title) should be a single key")
        }
        // ⇧N and ⇧1 are single keys too: they type, so they wait while a
        // field is being edited.
        #expect(BoardMenuCommand.key(.newList).isSingleKey)
        #expect(BoardMenuCommand.key(.jump(.time(.today))).isSingleKey)
        for command in [BoardMenuCommand.newTodo, .newList, .showDone, .search] + BoardMenuCommand.viewMenu {
            #expect(!command.isSingleKey, "\(command.title) has a modifier")
        }
    }

    @Test("Each single key a menu shows is one the keyboard map reads the same way")
    func menuKeysMatchKeyboard() {
        // What a US keyboard types for each key, Shift included.
        let shifted: [Character: String] = [
            "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
            "/": "?", "n": "N"
        ]
        let commands = BoardMenuCommand.todoMenu.compactMap { $0 } + BoardMenuCommand.moveMenu
            + BoardMenuCommand.shortcutSections.flatMap(\.commands)
        for command in commands {
            guard case .key(let key) = command, let shortcut = command.shortcut else { continue }
            var characters = shortcut.key == .return || shortcut.key == .delete || shortcut.key == .escape
                ? "" : String(shortcut.key.character)
            if shortcut.modifiers.contains(.shift), let typed = shifted[shortcut.key.character] { characters = typed }
            #expect(
                BoardKey.from(key: shortcut.key, characters: characters, modifiers: shortcut.modifiers) == key,
                "\(command.title)"
            )
        }
    }

    @Test("Jumps: ⇧-digits by what they type, and G then a letter")
    func jumps() {
        func key(_ characters: String, _ modifiers: EventModifiers = .shift) -> BoardKey? {
            BoardKey.from(key: KeyEquivalent(Character(characters)), characters: characters, modifiers: modifiers)
        }
        #expect(key("!") == .jump(.time(.today)))
        #expect(key("#") == .jump(.time(.someday)))
        #expect(key("$") == .jump(.list(0)))
        #expect(key("(") == .jump(.list(5)))
        #expect(key(")") == .jump(.done))
        #expect(key("N") == .newList)
        // Shift sent as a modifier with the unshifted character.
        #expect(key("2") == .jump(.time(.thisWeek)))
        #expect(key("5") == .jump(.list(1)))
        #expect(key("n") == .newList)
        #expect(key("2", []) == .move(.thisWeek))
        #expect(key("n", []) == .new)
        // Caps Lock types "N" with no Shift: still quick add.
        #expect(key("N", []) == .new)
        #expect(key("m", []) == .moveTo)
        #expect(key("g", []) == .go)
        #expect(BoardKey.from(key: .escape, characters: "", modifiers: []) == .back)
        #expect(BoardKey.afterGo("w") == .jump(.time(.thisWeek)))
        #expect(BoardKey.afterGo("D") == .jump(.done))
        #expect(BoardKey.afterGo("l") == .goToList)
        #expect(BoardKey.afterGo("x") == nil)
    }

    @Test("The shortcuts sheet draws a cap per key, with alternatives apart")
    func keyCaps() {
        #expect(BoardMenuCommand.key(.done).keyCaps == [["X"]])
        #expect(BoardMenuCommand.key(.down).keyCaps == [["J"], ["↓"]])
        #expect(BoardMenuCommand.key(.jump(.time(.today))).keyCaps == [["⇧1"], ["G", "T"]])
        #expect(BoardMenuCommand.key(.jump(.list(0))).keyCaps == [["⇧4–9"]])
        #expect(BoardMenuCommand.key(.goToList).keyCaps == [["G", "L"]])
        #expect(BoardMenuCommand.search.keyCaps == [["⌘K"]])
    }

    @Test("The shortcuts sheet's two columns keep every section, in order")
    func shortcutColumns() {
        let columns = BoardMenuCommand.shortcutColumns
        #expect(columns.map { $0.map(\.title) } == [["Move around", "Todo"], ["Go to", "Create", "Help"]])
        #expect(columns.flatMap { $0.flatMap(\.commands) } == BoardMenuCommand.shortcutSections.flatMap(\.commands))
    }

    #if os(macOS)
    /// The Mac sheet opens at its content's natural size, so this is the
    /// size it opens at: two columns, every row visible, short enough for
    /// a 1470×923 window once the title bar and sheet inset are taken off.
    @Test("The Mac shortcuts sheet opens in two columns, without scrolling")
    func shortcutsSheetSize() {
        let size = NSHostingView(rootView: KeyboardShortcutsView(onClose: {})).fittingSize
        #expect(size.width >= 2 * Theme.Wide.columnMinWidth)
        #expect(size.height <= 923 - 60)
    }
    #endif

    @Test("The shortcuts sheet shows each command's keys")
    func keyLabels() {
        #expect(BoardMenuCommand.key(.done).keyLabel == "X")
        #expect(BoardMenuCommand.key(.newList).keyLabel == "⇧N")
        #expect(BoardMenuCommand.search.keyLabel == "⌘K")
        #expect(BoardMenuCommand.key(.jump(.time(.today))).keyLabel == "⇧1 or G T")
        #expect(BoardMenuCommand.key(.delete).keyLabel == "⌫")
        #expect(BoardMenuCommand.key(.shortcuts).keyLabel == "?")
        let listed = Set(BoardMenuCommand.shortcutSections.flatMap(\.commands))
        for command in BoardMenuCommand.todoMenu.compactMap({ $0 }) {
            #expect(listed.contains(command) || command == .key(.open) || command == .key(.go),
                    "\(command.title) is in a menu but not the shortcuts sheet")
        }
    }

    @Test("Row commands wait for a selected row")
    func selection() {
        let recorder = Recorder()
        let none = handler(recorder, hasSelection: false)
        let some = handler(recorder, hasSelection: true)
        #expect(!BoardMenuCommand.key(.done).isEnabled(in: none))
        #expect(BoardMenuCommand.key(.done).isEnabled(in: some))
        #expect(!BoardMenuCommand.moveToList("groceries").isEnabled(in: none))
        #expect(BoardMenuCommand.key(.down).isEnabled(in: none))
        #expect(BoardMenuCommand.newTodo.isEnabled(in: none))
        // No board in front (Settings is key, say): nothing runs.
        #expect(!BoardMenuCommand.newTodo.isEnabled(in: nil))
    }

    @Test("A board key goes through perform; everything else through run")
    func routing() {
        let recorder = Recorder()
        let board = handler(recorder, hasSelection: true)
        board.handle(.key(.done))
        board.handle(.key(.move(.someday)))
        board.handle(.showList(.thisWeek))
        board.handle(.newList)
        board.handle(.moveToList("groceries"))
        #expect(recorder.keys == [.done, .move(.someday)])
        #expect(recorder.commands == [.showList(.thisWeek), .newList, .moveToList("groceries")])
    }
}

@Suite("Undo history")
@MainActor
struct UndoHistoryTests {
    /// Logs what's done to each entry; a name in `gone` makes it fail.
    final class Log {
        var lines: [String] = []
        var gone: Set<String> = []
        var announced: [String] = []

        func entry(_ text: String) -> UndoHistory.Entry {
            UndoHistory.Entry(
                text: text,
                undo: { [unowned self] in
                    guard !gone.contains(text) else { return false }
                    lines.append("undo \(text)")
                    return true
                },
                redo: { [unowned self] in
                    guard !gone.contains(text) else { return false }
                    lines.append("redo \(text)")
                    return true
                }
            )
        }
    }

    private func make() -> (UndoHistory, UndoManager, Log) {
        let history = UndoHistory()
        let manager = UndoManager()
        manager.groupsByEvent = false
        history.attach(manager)
        let log = Log()
        history.announce = { step, outcome in
            switch outcome {
            case .done(let entry): log.announced.append("\(step == .undo ? "Undone" : "Redone"): \(entry.text)")
            case .gone: log.announced.append("Already deleted")
            }
        }
        return (history, manager, log)
    }

    @Test("⌘Z steps back newest first, each named after its toast, then nothing")
    func undoesNewestFirst() {
        let (history, manager, log) = make()
        for text in ["Done", "Done", "Moved to this week"] { history.push(log.entry(text)) }
        #expect(manager.undoActionName == "Moved to this week")
        manager.undo()
        #expect(manager.undoActionName == "Done")
        #expect(manager.redoActionName == "Moved to this week")
        manager.undo()
        manager.undo()
        #expect(!manager.canUndo)
        #expect(log.lines == ["undo Moved to this week", "undo Done", "undo Done"])
        #expect(log.announced == ["Undone: Moved to this week", "Undone: Done", "Undone: Done"])
    }

    @Test("⇧⌘Z redoes the most recently undone first, back onto ⌘Z")
    func redoesForward() {
        let (history, manager, log) = make()
        for text in ["a", "b", "c"] { history.push(log.entry(text)) }
        manager.undo()
        manager.undo()
        #expect(manager.redoActionName == "b")
        manager.redo()
        manager.redo()
        #expect(!manager.canRedo)
        #expect(manager.undoActionName == "c")
        manager.undo()
        #expect(log.lines.suffix(3) == ["redo b", "redo c", "undo c"])
        #expect(log.announced.suffix(3) == ["Redone: b", "Redone: c", "Undone: c"])
    }

    @Test("a new action clears redo")
    func newActionClearsRedo() {
        let (history, manager, log) = make()
        history.push(log.entry("a"))
        history.push(log.entry("b"))
        manager.undo()
        history.push(log.entry("c"))
        #expect(!manager.canRedo)
        #expect(history.future.isEmpty)
        #expect(history.past.map(\.text) == ["a", "c"])
    }

    @Test("holds 20; a 21st pushes out the oldest")
    func holdsTwenty() {
        let (history, manager, log) = make()
        for index in 1...(UndoHistory.limit + 1) { history.push(log.entry(String(index))) }
        #expect(history.past.count == UndoHistory.limit)
        for _ in 1...UndoHistory.limit { manager.undo() }
        #expect(!manager.canUndo)
        #expect(log.lines.first == "undo 21")
        #expect(log.lines.last == "undo 2")
    }

    @Test("a dropped action (a sent delete) leaves ⌘Z and ⇧⌘Z")
    func dropLeaves() {
        let (history, manager, log) = make()
        let deleted = log.entry("Deleted")
        history.push(log.entry("Done"))
        history.push(deleted)
        history.drop(deleted)
        #expect(manager.undoActionName == "Done")
        manager.undo()
        #expect(log.lines == ["undo Done"])
        #expect(history.past.isEmpty)
    }

    @Test("an action whose todo has gone says Already deleted and drops out")
    func goneDrops() {
        let (history, manager, log) = make()
        history.push(log.entry("Done"))
        history.push(log.entry("Moved to this week"))
        log.gone = ["Moved to this week"]
        manager.undo()
        #expect(log.announced == ["Already deleted"])
        #expect(!manager.canRedo)
        #expect(manager.undoActionName == "Done")
        #expect(history.past.map(\.text) == ["Done"])
    }

    @Test("a toast's Undo button undoes through ⌘Z, so ⇧⌘Z can redo it")
    func toastUndoIsRedoable() {
        let (history, manager, log) = make()
        let done = log.entry("Done")
        history.push(done)
        history.undo(done)
        #expect(log.lines == ["undo Done"])
        #expect(log.announced.isEmpty)
        #expect(!manager.canUndo)
        #expect(manager.redoActionName == "Done")
        manager.redo()
        #expect(log.lines == ["undo Done", "redo Done"])
    }

    @Test("a toast's Undo for an action that's left the history says so")
    func toastUndoAfterDrop() {
        let (history, _, log) = make()
        let deleted = log.entry("Deleted")
        history.push(deleted)
        history.drop(deleted)
        history.undo(deleted)
        #expect(log.lines.isEmpty)
        #expect(log.announced == ["Already deleted"])
    }

    @Test("something typed since stays on top: a toast's Undo leaves it, and ⌘Z undoes the typing")
    func typingAbove() {
        let (history, manager, log) = make()
        let done = log.entry("Done")
        history.push(done)
        final class Field { var undone = false }
        let field = Field()
        manager.beginUndoGrouping()
        manager.registerUndo(withTarget: field) { $0.undone = true }
        manager.setActionName("Typing")
        manager.endUndoGrouping()
        history.undo(done)
        #expect(log.lines == ["undo Done"])
        #expect(manager.undoActionName == "Typing")
        manager.undo()
        #expect(field.undone)
        #expect(!manager.canUndo)
    }
}
