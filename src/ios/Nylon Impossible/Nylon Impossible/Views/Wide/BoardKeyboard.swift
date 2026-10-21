//
//  BoardKeyboard.swift
//  Nylon Impossible
//
//  The iPad board's hardware-keyboard map, the same keys as wide web:
//
//    j / k, ↓ / ↑     move through rows
//    h / l, ← / →     move across columns
//    x                done
//    Return           open
//    1 / 2 / 3        move to Today / This Week / Someday
//    p                pin
//    d                due
//    Delete           delete, with Undo
//    n                new todo in the focused column
//    ⌘N               new todo (works while typing, too)
//
//  The board handles keys with `onKeyPress` while it has focus. The same keys
//  are published as a "Todo" menu so they show in the iPadOS shortcut overlay
//  and menu bar; the single-key ones are only listed while no field is being
//  edited, so they can never swallow typing.
//

import SwiftUI

enum BoardKey: Equatable, Hashable {
    case down, up, left, right
    case done, open, pin, due, delete, new
    case move(SystemListKind)

    /// The key a press means, or nil. Presses with ⌘, ⌃ or ⌥ are left alone
    /// so system and menu shortcuts keep working.
    static func from(key: KeyEquivalent, characters: String, modifiers: EventModifiers) -> BoardKey? {
        guard modifiers.isDisjoint(with: [.command, .control, .option]) else { return nil }
        switch key {
        case .downArrow: return .down
        case .upArrow: return .up
        case .leftArrow: return .left
        case .rightArrow: return .right
        case .return: return .open
        case .delete, .deleteForward: return .delete
        default: break
        }
        switch characters.lowercased() {
        case "j": return .down
        case "k": return .up
        case "h": return .left
        case "l": return .right
        case "x": return .done
        case "p": return .pin
        case "d": return .due
        case "n": return .new
        case "1": return .move(.today)
        case "2": return .move(.thisWeek)
        case "3": return .move(.someday)
        default: return nil
        }
    }
}

/// Selection arithmetic, kept apart from the view so it can be tested.
enum BoardNavigator {
    /// The row `offset` away from `current`, clamped to the column. With no
    /// current row (or one that's gone), down starts at the top and up at the
    /// bottom.
    static func step(_ rows: [UUID], from current: UUID?, by offset: Int) -> UUID? {
        guard !rows.isEmpty else { return nil }
        guard let current, let index = rows.firstIndex(of: current) else {
            return offset >= 0 ? rows.first : rows.last
        }
        return rows[min(max(index + offset, 0), rows.count - 1)]
    }

    /// Where the selection goes when `leaving` leaves the column: the row
    /// after it, else the one before, else nothing.
    static func neighbor(of leaving: UUID, in rows: [UUID]) -> UUID? {
        guard let index = rows.firstIndex(of: leaving) else { return nil }
        if index + 1 < rows.count { return rows[index + 1] }
        return index > 0 ? rows[index - 1] : nil
    }

    /// Moving across columns keeps the row's position where it can.
    static func across(from rows: [UUID], current: UUID?, to target: [UUID]) -> UUID? {
        guard !target.isEmpty else { return nil }
        let index = current.flatMap { rows.firstIndex(of: $0) } ?? 0
        return target[min(index, target.count - 1)]
    }

    /// The column index `offset` away, clamped.
    static func column(_ current: Int, by offset: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return min(max(current + offset, 0), count - 1)
    }
}

/// What the board publishes to the scene's commands.
struct BoardCommandHandler {
    /// False while a text field has focus: only ⌘N stays listed then.
    let keysEnabled: Bool
    let perform: (BoardKey) -> Void
}

extension FocusedValues {
    @Entry var board: BoardCommandHandler?
}

/// The "Todo" menu: the board's keys, for the shortcut overlay and menu bar.
struct BoardCommands: Commands {
    @FocusedValue(\.board) private var board

    var body: some Commands {
        CommandMenu("Todo") {
            Button("New Todo") { board?.perform(.new) }
                .keyboardShortcut("n", modifiers: .command)
                .disabled(board == nil)
            if let board, board.keysEnabled {
                Section {
                    item("New Todo in Column", .new, "n", board)
                    item("Next", .down, "j", board)
                    item("Previous", .up, "k", board)
                    item("Column Left", .left, "h", board)
                    item("Column Right", .right, "l", board)
                }
                Section {
                    item("Mark Done", .done, "x", board)
                    item("Open", .open, .return, board)
                    item("Pin", .pin, "p", board)
                    item("Due…", .due, "d", board)
                    item("Delete", .delete, .delete, board)
                }
                Section {
                    item("Move to Today", .move(.today), "1", board)
                    item("Move to This Week", .move(.thisWeek), "2", board)
                    item("Move to Someday", .move(.someday), "3", board)
                }
            }
        }
    }

    private func item(_ title: String, _ key: BoardKey, _ shortcut: KeyEquivalent, _ board: BoardCommandHandler) -> some View {
        Button(title) { board.perform(key) }
            .keyboardShortcut(shortcut, modifiers: [])
    }
}
