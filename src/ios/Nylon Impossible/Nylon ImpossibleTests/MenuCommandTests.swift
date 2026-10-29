//
//  MenuCommandTests.swift
//  Nylon ImpossibleTests
//
//  The board's menu commands: the keys the Mac's File, View and Todo menus
//  show, which of them are single keys (bound only while no field is being
//  edited), what needs a selected row, and how a command reaches the board —
//  a board key through `perform`, everything else through `run`. Plus the
//  Undo bridge that puts the toast's Undo on ⌘Z.
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
        #expect(key("m", []) == .moveTo)
        #expect(key("g", []) == .go)
        #expect(BoardKey.from(key: .escape, characters: "", modifiers: []) == .back)
        #expect(BoardKey.afterGo("w") == .jump(.time(.thisWeek)))
        #expect(BoardKey.afterGo("D") == .jump(.done))
        #expect(BoardKey.afterGo("l") == .goToList)
        #expect(BoardKey.afterGo("x") == nil)
    }

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

@Suite("Toast undo bridge")
@MainActor
struct ToastUndoBridgeTests {
    @Test("⌘Z runs the toast's Undo while it's up")
    func undoRunsAction() {
        let toasts = ToastCenter()
        let undoManager = UndoManager()
        undoManager.groupsByEvent = false
        let bridge = ToastUndoBridge()
        var undone = false
        toasts.show("Done") { undone = true }
        undoManager.beginUndoGrouping()
        bridge.sync(toasts, undoManager: undoManager)
        undoManager.endUndoGrouping()
        #expect(undoManager.canUndo)
        #expect(undoManager.undoActionName == "Done")
        undoManager.undo()
        #expect(undone)
        #expect(toasts.current == nil)
    }

    @Test("An expired or replaced toast takes its Undo with it")
    func expiryRemovesUndo() {
        let toasts = ToastCenter()
        let undoManager = UndoManager()
        undoManager.groupsByEvent = false
        let bridge = ToastUndoBridge()
        toasts.show("Deleted") {}
        undoManager.beginUndoGrouping()
        bridge.sync(toasts, undoManager: undoManager)
        undoManager.endUndoGrouping()
        toasts.expire()
        bridge.sync(toasts, undoManager: undoManager)
        #expect(!undoManager.canUndo)
        #expect(bridge.registeredId == nil)
    }

    @Test("A toast without Undo registers nothing")
    func viewToastIgnored() {
        let toasts = ToastCenter()
        let undoManager = UndoManager()
        let bridge = ToastUndoBridge()
        toasts.show("Added to Someday", actionLabel: "View") {}
        bridge.sync(toasts, undoManager: undoManager)
        #expect(!undoManager.canUndo)
    }
}
