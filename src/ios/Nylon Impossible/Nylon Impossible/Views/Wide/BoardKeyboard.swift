//
//  BoardKeyboard.swift
//  Nylon Impossible
//
//  The board's hardware-keyboard map (iPad and Mac), the same keys as wide
//  web. The keyboard is either on a section (the sidebar, a column, the open
//  todo), which shows a light outline, or in it:
//
//    Tab / ⇧Tab       next / previous section, wrapping around: the
//                     sidebar, Today, This week, Someday, the fourth column,
//                     then the open todo
//    Return           step in: a column's first todo (its Add when it's
//                     empty), the sidebar's item for the column you came
//                     from, the open todo's title. In a column: open the
//                     todo, or start typing in Add. In the sidebar: go into
//                     that column
//    Esc              step out one level: out of a field, out of a column or
//                     the sidebar, then close the open todo. On a column it
//                     goes to the sidebar, on that column's item
//    h / l, ← / →     on a section: the adjacent section. In a column: the
//                     same place in the next column; ← from the first goes
//                     to the sidebar
//    j / k, ↓ / ↑     move through rows, or the sidebar's items. Add sits
//                     above a column's first todo
//    x                done
//    1 / 2 / 3        move to Today / This week / Someday
//    m                move to a list…
//    o                open the todo's first link
//    p                pin
//    d                due
//    Delete           delete, with Undo
//    n                new todo: typing in this column's Add, or quick add
//                     where there's no Add (the sidebar, Done, the open todo)
//    ⇧N               new list
//    ⇧1 ⇧2 ⇧3         go to Today / This week / Someday
//    ⇧4 … ⇧9, ⇧0      go to your lists, in sidebar order / Done
//    g, then t w s d  go to Today / This week / Someday / Done
//    g, then l        go to a list (the palette, lists only)
//    ?                keyboard shortcuts
//    ⌘K               search and commands (works while typing, too)
//    ⌘N               new todo in quick add (works while typing, too)
//
//  The row keys (x, p, d, m, o, 1/2/3, Delete) act on the selected row, or
//  on the open todo while the keyboard is on it.
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
    /// Tab and ⇧Tab: the next or previous section.
    case nextSection, previousSection
    case done, open, pin, due, delete, new
    case move(SystemListKind)
    case back, moveTo, newList, go, goToList, shortcuts, openLink
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
        case .tab: return modifiers.contains(.shift) ? .previousSection : .nextSection
        default: break
        }
        // ⇧Tab can arrive as a back-tab character rather than Tab with Shift.
        if characters == "\u{19}" { return .previousSection }
        if let first = characters.first, characters.count == 1, let jump = shiftedDigits[first] {
            return .jump(jump)
        }
        if characters == "N", modifiers.contains(.shift) { return .newList }
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
        case "o": return .openLink
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

/// A part of the board the keyboard can be on. Tab and ⇧Tab visit them in
/// order, and the one with the keyboard is outlined.
enum BoardSection: Hashable {
    case sidebar
    /// A column, by its key: a list's id, or `done` (ContentView.doneColumn).
    case column(String)
    /// The open todo's detail, in the fourth column.
    case detail
}

/// Where the keyboard is inside a column: on its Add field, or on a row.
enum ColumnSpot: Equatable {
    case add
    case row(UUID)
}

/// What a key does while the keyboard is on a section, with nothing inside
/// it selected.
enum SectionMove: Equatable {
    /// Onto another section (Tab, ⇧Tab, ← →).
    case section(BoardSection)
    /// Return: into the section.
    case stepIn
    /// Esc on a column: into the sidebar, on that column's item.
    case sidebar(column: String)
    /// Esc on the open todo: close it, back to its row.
    case closeDetail
    case none
}

/// Section arithmetic, kept apart from the view so it can be tested.
enum BoardSections {
    /// Tab order: the sidebar, the columns left to right (the fourth is your
    /// list or Done, when no todo covers it), then the open todo.
    static func order(columns: [String], hasDetail: Bool) -> [BoardSection] {
        [.sidebar] + columns.map(BoardSection.column) + (hasDetail ? [.detail] : [])
    }

    /// Tab and ⇧Tab: the section `offset` away, wrapping around.
    static func cycle(_ current: BoardSection, by offset: Int, in order: [BoardSection]) -> BoardSection {
        guard !order.isEmpty else { return current }
        let index = order.firstIndex(of: current) ?? 0
        let count = order.count
        return order[((index + offset) % count + count) % count]
    }

    /// ← and →: the adjacent section, stopping at the ends.
    static func adjacent(_ current: BoardSection, by offset: Int, in order: [BoardSection]) -> BoardSection {
        guard let index = order.firstIndex(of: current) else { return order.first ?? current }
        return order[BoardNavigator.column(index, by: offset, count: order.count)]
    }

    /// The column whose Add field n types in, or nil for quick add: the
    /// sidebar, Done and the open todo have no Add.
    static func addColumn(for section: BoardSection, done: String) -> String? {
        guard case .column(let id) = section, id != done else { return nil }
        return id
    }

    /// A key while the keyboard is on `section`, with nothing inside it
    /// selected. Keys that aren't about sections (n, the jumps, the row
    /// keys) are left to the board.
    static func onSection(_ key: BoardKey, section: BoardSection, order: [BoardSection]) -> SectionMove {
        switch key {
        case .nextSection: return .section(cycle(section, by: 1, in: order))
        case .previousSection: return .section(cycle(section, by: -1, in: order))
        case .left: return .section(adjacent(section, by: -1, in: order))
        case .right: return .section(adjacent(section, by: 1, in: order))
        case .open: return .stepIn
        case .back:
            switch section {
            case .sidebar: return .none
            case .column(let id): return .sidebar(column: id)
            case .detail: return .closeDetail
            }
        default: return .none
        }
    }

    /// Return (or ↓) into a column: its first todo, else its Add, else
    /// nothing (an empty Done).
    static func stepIn(rows: [UUID], hasAdd: Bool) -> ColumnSpot? {
        if let first = rows.first { return .row(first) }
        return hasAdd ? .add : nil
    }

    /// ↑ ↓ inside a column, where Add sits above the first todo: ↑ from the
    /// first todo reaches Add, ↓ from Add the first todo. Elsewhere the
    /// selection steps and stops at the ends.
    static func vertical(rows: [UUID], from spot: ColumnSpot, by offset: Int, hasAdd: Bool) -> ColumnSpot {
        switch spot {
        case .add:
            guard offset > 0, let first = rows.first else { return .add }
            return .row(first)
        case .row(let id):
            if offset < 0, hasAdd, rows.first == id { return .add }
            return BoardNavigator.step(rows, from: id, by: offset).map(ColumnSpot.row) ?? (hasAdd ? .add : spot)
        }
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
