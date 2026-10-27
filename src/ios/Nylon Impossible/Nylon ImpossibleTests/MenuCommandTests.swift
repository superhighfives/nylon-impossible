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
        #expect(BoardMenuCommand.newTodo.title == "New Todo")
        #expect(BoardMenuCommand.newList.title == "New List")
        #expect(BoardMenuCommand.showList(.thisWeek).title == "This Week")
        #expect(BoardMenuCommand.key(.done).title == "Mark Done")
        #expect(BoardMenuCommand.key(.due).title == "Due…")
        #expect(BoardMenuCommand.moveMenu.map(\.title) == ["Today", "This Week", "Someday"])
    }

    @Test("Only the board's own keys are single keys")
    func singleKeys() {
        for command in BoardMenuCommand.todoMenu.compactMap({ $0 }) + BoardMenuCommand.moveMenu {
            #expect(command.isSingleKey, "\(command.title) should be a single key")
        }
        for command in [BoardMenuCommand.newTodo, .newList, .showDone] + BoardMenuCommand.viewMenu {
            #expect(!command.isSingleKey, "\(command.title) has a modifier")
        }
    }

    @Test("Each single key a menu shows is one the keyboard map reads the same way")
    func menuKeysMatchKeyboard() {
        for command in BoardMenuCommand.todoMenu.compactMap({ $0 }) + BoardMenuCommand.moveMenu {
            guard case .key(let key) = command, let shortcut = command.shortcut else { continue }
            let characters = shortcut.key == .return || shortcut.key == .delete ? "" : String(shortcut.key.character)
            #expect(BoardKey.from(key: shortcut.key, characters: characters, modifiers: []) == key)
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
