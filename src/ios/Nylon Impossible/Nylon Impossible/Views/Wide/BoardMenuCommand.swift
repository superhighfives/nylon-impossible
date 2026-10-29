//
//  BoardMenuCommand.swift
//  Nylon Impossible
//
//  Every command the board has, with its title, its key and what it does —
//  one table, so the Mac's File, View and Todo menus, the iPad's "Todo"
//  menu, the Keyboard shortcuts sheet, the palette and the tests all read
//  the same thing. The board turns a command into an action in
//  `ContentView.run(_:)`.
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
    /// ⌘K: the palette. Works while typing.
    case search

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
        case .search: return "Search and commands"
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
            case .new: return "New todo"
            case .move(let kind): return "Move to \(kind.title)"
            case .back: return "Back out: close, then the sidebar"
            case .moveTo: return "Move to a list…"
            case .newList: return "New list"
            case .go: return "Go to…"
            case .goToList: return "Go to a list"
            case .shortcuts: return "Keyboard shortcuts"
            case .jump(.time(let kind)): return kind.title
            case .jump(.list): return "Your lists, in sidebar order"
            case .jump(.done): return "Done"
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
        case .search: return Shortcut(key: "k", modifiers: .command)
        case .key(let key): return key.menuShortcut
        }
    }

    /// Single keys, Shift allowed (⇧N, ⇧1). They're only bound while no text
    /// field is being edited, so they can never swallow typing.
    var isSingleKey: Bool {
        guard let shortcut else { return false }
        return shortcut.modifiers.isDisjoint(with: [.command, .control, .option])
    }

    /// The keys as the shortcuts sheet and the palette show them: "X",
    /// "⇧1 or G T", "⌘K".
    var keyLabel: String {
        switch self {
        case .key(.down): return "J or ↓"
        case .key(.up): return "K or ↑"
        case .key(.left): return "H or ←"
        case .key(.right): return "L or →"
        case .key(.jump(.time(.today))): return "⇧1 or G T"
        case .key(.jump(.time(.thisWeek))): return "⇧2 or G W"
        case .key(.jump(.time(.someday))): return "⇧3 or G S"
        case .key(.jump(.list)): return "⇧4–9"
        case .key(.jump(.done)): return "⇧0 or G D"
        case .key(.go): return "G"
        case .key(.goToList): return "G L"
        case .key(.shortcuts): return "?"
        default:
            guard let shortcut else { return "" }
            return Self.label(shortcut)
        }
    }

    static func label(_ shortcut: Shortcut) -> String {
        var text = ""
        if shortcut.modifiers.contains(.control) { text += "⌃" }
        if shortcut.modifiers.contains(.option) { text += "⌥" }
        if shortcut.modifiers.contains(.shift) { text += "⇧" }
        if shortcut.modifiers.contains(.command) { text += "⌘" }
        switch shortcut.key {
        case .return: text += "↵"
        case .delete: text += "⌫"
        case .escape: text += "Esc"
        default: text += String(shortcut.key.character).uppercased()
        }
        return text
    }

    /// The Keyboard shortcuts sheet, in order.
    static let shortcutSections: [(title: String, commands: [BoardMenuCommand])] = [
        ("Move around", [.key(.down), .key(.up), .key(.left), .key(.right), .key(.open), .key(.back)]),
        ("Todo", [
            .key(.done), .key(.move(.today)), .key(.move(.thisWeek)), .key(.move(.someday)),
            .key(.moveTo), .key(.pin), .key(.due), .key(.delete)
        ]),
        ("Go to", [
            .key(.jump(.time(.today))), .key(.jump(.time(.thisWeek))), .key(.jump(.time(.someday))),
            .key(.jump(.list(0))), .key(.jump(.done)), .key(.goToList), .search
        ]),
        ("Create", [.key(.new), .key(.newList)]),
        ("Help", [.key(.shortcuts)])
    ]

    /// Commands that act on the selected row.
    var needsSelection: Bool {
        switch self {
        case .moveToList: return true
        case .key(let key):
            switch key {
            case .done, .open, .pin, .due, .delete, .move, .moveTo: return true
            default: return false
            }
        default: return false
        }
    }

    /// The Todo menu, in order; `nil` is a divider.
    static let todoMenu: [BoardMenuCommand?] = [
        .search,
        nil,
        .key(.done), .key(.open), .key(.pin), .key(.due), .key(.delete), .key(.moveTo),
        nil,
        .key(.down), .key(.up), .key(.left), .key(.right),
        nil,
        .key(.jump(.time(.today))), .key(.jump(.time(.thisWeek))), .key(.jump(.time(.someday))),
        .key(.jump(.done)),
        nil,
        .key(.new), .key(.newList), .key(.shortcuts)
    ]

    /// Todo ▸ Move to, for the time lists.
    static let moveMenu: [BoardMenuCommand] = [.key(.move(.today)), .key(.move(.thisWeek)), .key(.move(.someday))]

    /// View's list items.
    static let viewMenu: [BoardMenuCommand] = [.showList(.today), .showList(.thisWeek), .showList(.someday)]

    /// The Mac's Todo ▸ Move to submenu says just the list's name.
    var submenuTitle: String {
        if case .key(.move(let kind)) = self { return kind.title }
        return title
    }

    /// Whether this command can run now, given what the board reports.
    func isEnabled(in board: BoardCommandHandler?) -> Bool {
        guard let board else { return false }
        if needsSelection && !board.hasSelection { return false }
        return true
    }
}

extension BoardKey {
    /// The key a menu shows for this command (arrows double up with
    /// j/k/h/l, so menus list the letters).
    var menuShortcut: BoardMenuCommand.Shortcut? {
        typealias S = BoardMenuCommand.Shortcut
        switch self {
        case .down: return S(key: "j", modifiers: [])
        case .up: return S(key: "k", modifiers: [])
        case .left: return S(key: "h", modifiers: [])
        case .right: return S(key: "l", modifiers: [])
        case .done: return S(key: "x", modifiers: [])
        case .open: return S(key: .return, modifiers: [])
        case .back: return S(key: .escape, modifiers: [])
        case .pin: return S(key: "p", modifiers: [])
        case .due: return S(key: "d", modifiers: [])
        case .delete: return S(key: .delete, modifiers: [])
        case .new: return S(key: "n", modifiers: [])
        case .newList: return S(key: "n", modifiers: .shift)
        case .moveTo: return S(key: "m", modifiers: [])
        case .go: return S(key: "g", modifiers: [])
        case .goToList: return nil
        case .shortcuts: return S(key: "/", modifiers: .shift)
        case .move(.today): return S(key: "1", modifiers: [])
        case .move(.thisWeek): return S(key: "2", modifiers: [])
        case .move(.someday): return S(key: "3", modifiers: [])
        case .jump(.time(.today)): return S(key: "1", modifiers: .shift)
        case .jump(.time(.thisWeek)): return S(key: "2", modifiers: .shift)
        case .jump(.time(.someday)): return S(key: "3", modifiers: .shift)
        case .jump(.list(let index)): return index < 6 ? S(key: KeyEquivalent(Character("\(index + 4)")), modifiers: .shift) : nil
        case .jump(.done): return S(key: "0", modifiers: .shift)
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
