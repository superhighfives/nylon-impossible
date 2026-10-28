//
//  BoardMenuCommand.swift
//  Nylon Impossible
//
//  Every command the board puts in a menu, with its title, its key and what
//  it does — one table, so the Mac's File, View and Todo menus, the iPad's
//  "Todo" menu and the tests all read the same thing. The board turns a
//  command into an action in `ContentView.run(_:)`.
//

import SwiftUI

enum BoardMenuCommand: Hashable {
    case newTodo
    case newList
    /// View ▸ Today / This week / Someday: show and focus that column.
    case showList(SystemListKind)
    case showDone
    /// A key from the board's single-key map, as a menu item.
    case key(BoardKey)
    /// Todo ▸ Move to ▸ one of your lists, by id.
    case moveToList(String)

    struct Shortcut: Equatable {
        let key: KeyEquivalent
        let modifiers: EventModifiers
    }

    var title: String {
        switch self {
        case .newTodo: return "New todo"
        case .newList: return "New list"
        case .showList(let kind): return kind.title
        case .showDone: return "Show done"
        case .moveToList: return "Move"
        case .key(let key):
            switch key {
            case .down: return "Next"
            case .up: return "Previous"
            case .left: return "Column left"
            case .right: return "Column right"
            case .done: return "Mark done"
            case .open: return "Open"
            case .pin: return "Pin"
            case .due: return "Due…"
            case .delete: return "Delete"
            case .new: return "New todo in column"
            case .move(let kind): return kind.title
            }
        }
    }

    var shortcut: Shortcut? {
        switch self {
        case .newTodo: return Shortcut(key: "n", modifiers: .command)
        case .newList: return Shortcut(key: "n", modifiers: [.command, .shift])
        case .showList(.today): return Shortcut(key: "1", modifiers: .command)
        case .showList(.thisWeek): return Shortcut(key: "2", modifiers: .command)
        case .showList(.someday): return Shortcut(key: "3", modifiers: .command)
        case .showDone: return Shortcut(key: "d", modifiers: [.command, .shift])
        case .moveToList: return nil
        case .key(let key): return key.menuShortcut.map { Shortcut(key: $0, modifiers: []) }
        }
    }

    /// Single keys with no modifier. They're only bound while no text field
    /// is being edited, so they can never swallow typing.
    var isSingleKey: Bool {
        guard let shortcut else { return false }
        return shortcut.modifiers.isEmpty
    }

    /// Commands that act on the selected row.
    var needsSelection: Bool {
        switch self {
        case .moveToList: return true
        case .key(let key):
            switch key {
            case .done, .open, .pin, .due, .delete, .move: return true
            default: return false
            }
        default: return false
        }
    }

    /// The Todo menu, in order; `nil` is a divider.
    static let todoMenu: [BoardMenuCommand?] = [
        .key(.done), .key(.open), .key(.pin), .key(.due), .key(.delete),
        nil,
        .key(.down), .key(.up), .key(.left), .key(.right), .key(.new)
    ]

    /// Todo ▸ Move to, for the time lists.
    static let moveMenu: [BoardMenuCommand] = [.key(.move(.today)), .key(.move(.thisWeek)), .key(.move(.someday))]

    /// View's list items.
    static let viewMenu: [BoardMenuCommand] = [.showList(.today), .showList(.thisWeek), .showList(.someday)]

    /// Whether this command can run now, given what the board reports.
    func isEnabled(in board: BoardCommandHandler?) -> Bool {
        guard let board else { return false }
        if needsSelection && !board.hasSelection { return false }
        return true
    }
}

extension BoardKey {
    /// The key a menu shows for this command, or nil for keys menus don't
    /// list on their own (arrows double up with j/k/h/l).
    var menuShortcut: KeyEquivalent? {
        switch self {
        case .down: return "j"
        case .up: return "k"
        case .left: return "h"
        case .right: return "l"
        case .done: return "x"
        case .open: return .return
        case .pin: return "p"
        case .due: return "d"
        case .delete: return .delete
        case .new: return "n"
        case .move(.today): return "1"
        case .move(.thisWeek): return "2"
        case .move(.someday): return "3"
        }
    }
}

extension SystemListKind {
    /// The list's name in menus.
    var title: String {
        switch self {
        case .today: return "Today"
        case .thisWeek: return "This week"
        case .someday: return "Someday"
        }
    }
}
