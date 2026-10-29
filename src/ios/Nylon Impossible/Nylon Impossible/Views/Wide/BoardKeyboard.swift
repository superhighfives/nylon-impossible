//
//  BoardKeyboard.swift
//  Nylon Impossible
//
//  The board's hardware-keyboard map (iPad and Mac), the same keys as wide
//  web:
//
//    j / k, ↓ / ↑     move through rows, or the sidebar's items
//    h / l, ← / →     move across columns; ← from the first goes to the
//                     sidebar, → from the sidebar goes back in
//    Return           open (in the sidebar: go into that column)
//    Esc              close the open todo, else go to the sidebar
//    x                done
//    1 / 2 / 3        move to Today / This week / Someday
//    m                move to a list…
//    p                pin
//    d                due
//    Delete           delete, with Undo
//    n / ⇧N           new todo (quick add) / new list
//    ⇧1 ⇧2 ⇧3         go to Today / This week / Someday
//    ⇧4 … ⇧9, ⇧0      go to your lists, in sidebar order / Done
//    g, then t w s d  go to Today / This week / Someday / Done
//    g, then l        go to a list (the palette, lists only)
//    ?                keyboard shortcuts
//    ⌘K               search and commands (works while typing, too)
//    ⌘N               new todo (works while typing, too)
//
//  ⇧-digits are read from the character they type ("!" for ⇧1): SwiftUI's
//  key presses don't carry a physical key code. On a non-US layout the
//  punctuation differs, and the Mac's ⌘1/2/3 in the View menu still work.
//
//  The board handles keys with `onKeyPress` while it has focus. The same keys
//  are published as a "Todo" menu so they show in the iPadOS shortcut overlay
//  and menu bar; the single-key ones are only listed while no field is being
//  edited, so they can never swallow typing.
//

import SwiftUI

/// Where a jump lands.
enum BoardJump: Equatable, Hashable {
    case time(SystemListKind)
    /// One of your lists, by its place in the sidebar (⇧4 is 0).
    case list(Int)
    case done
}

enum BoardKey: Equatable, Hashable {
    case down, up, left, right
    case done, open, pin, due, delete, new
    case move(SystemListKind)
    case back, moveTo, newList, go, goToList, shortcuts
    case jump(BoardJump)

    /// ⇧1…⇧0 as the US layout types them.
    private static let shiftedDigits: [Character: BoardJump] = [
        "!": .time(.today), "@": .time(.thisWeek), "#": .time(.someday),
        "$": .list(0), "%": .list(1), "^": .list(2), "&": .list(3), "*": .list(4), "(": .list(5),
        ")": .done
    ]

    /// After g: the letter's destination, or nil (any other key cancels).
    static func afterGo(_ characters: String) -> BoardKey? {
        switch characters.lowercased() {
        case "t": return .jump(.time(.today))
        case "w": return .jump(.time(.thisWeek))
        case "s": return .jump(.time(.someday))
        case "d": return .jump(.done)
        case "l": return .goToList
        default: return nil
        }
    }

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
        case .escape: return .back
        case .delete, .deleteForward: return .delete
        default: break
        }
        if let first = characters.first, characters.count == 1, let jump = shiftedDigits[first] {
            return .jump(jump)
        }
        if characters == "N" { return .newList }
        if characters == "?" { return .shortcuts }
        // Some keyboards (and XCUITest) send Shift with the unshifted
        // character: ⇧2 as "2", ⇧N as "n".
        if modifiers.contains(.shift) {
            switch characters.lowercased() {
            case "1": return .jump(.time(.today))
            case "2": return .jump(.time(.thisWeek))
            case "3": return .jump(.time(.someday))
            case "4", "5", "6", "7", "8", "9": return .jump(.list((Int(characters) ?? 4) - 4))
            case "0": return .jump(.done)
            case "n": return .newList
            case "/": return .shortcuts
            default: break
            }
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
        case "m": return .moveTo
        case "g": return .go
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
    /// A row is selected, so the Todo menu's row commands can run.
    var hasSelection = false
    /// Your lists, for Todo ▸ Move to.
    var collections: [(id: String, name: String)] = []
    /// The focused list's name, for the Mac window title.
    var focusedListName: String?
    let perform: (BoardKey) -> Void
    /// Commands that aren't single keys (New List, View ▸ Today, …).
    var run: (BoardMenuCommand) -> Void = { _ in }

    /// Route a menu command: a board key goes through `perform`, so the menu
    /// and the keyboard share one path; everything else through `run`.
    func handle(_ command: BoardMenuCommand) {
        if case .key(let key) = command {
            perform(key)
        } else {
            run(command)
        }
    }
}

extension FocusedValues {
    @Entry var board: BoardCommandHandler?
}

/// The iPad's "Todo" menu: the board's commands from `BoardMenuCommand`, so
/// they show in the shortcut overlay (hold ⌘) and work as key commands.
/// Single keys are only bound while no field is being edited.
struct BoardCommands: Commands {
    @FocusedValue(\.board) private var board
    /// Send Feedback… in the Help menu, for an admin.
    var feedback: FeedbackService?
    var showsFeedback = false

    var body: some Commands {
        CommandGroup(after: .help) {
            if showsFeedback, let feedback {
                Button("Send feedback…") { feedback.presentWithSnapshot() }
                    .keyboardShortcut(FeedbackService.shortcut.key, modifiers: FeedbackService.shortcut.modifiers)
            }
        }
        CommandMenu("Todo") {
            item(.newTodo)
            ForEach(Array(BoardMenuCommand.todoMenu.enumerated()), id: \.offset) { _, command in
                if let command {
                    // Single keys only while the board has the keyboard, so
                    // the overlay never lists keys that would eat typing.
                    if !command.isSingleKey || board?.keysEnabled == true { item(command) }
                } else {
                    Divider()
                }
            }
        }
    }

    @ViewBuilder
    private func item(_ command: BoardMenuCommand) -> some View {
        let button = Button(command.title) { board?.handle(command) }
            .disabled(!command.isEnabled(in: board))
        if let shortcut = command.shortcut {
            button.keyboardShortcut(shortcut.key, modifiers: shortcut.modifiers)
        } else {
            button
        }
    }
}
