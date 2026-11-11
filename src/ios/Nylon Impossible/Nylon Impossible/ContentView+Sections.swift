//
//  ContentView+Sections.swift
//  Nylon Impossible
//
//  The board's keys inside a column and on the open todo: Add above the
//  first todo, crossing columns at the same place, and the row keys. Split
//  from ContentView+WideKeys.swift, which routes each key to its section.
//

import SwiftUI

extension ContentView {
    // MARK: - In a column

    func performInColumn(_ key: BoardKey, column: String) {
        let ids = keyRows(column)
        let hasAdd = column != Self.doneColumn
        guard let spot = spot(in: column) else {
            // On the column: ↓ and ↑ step in at the top or the bottom.
            switch key {
            case .down:
                place(BoardSections.stepIn(rows: ids, hasAdd: hasAdd), in: column)
            case .up:
                place(ids.last.map(ColumnSpot.row) ?? BoardSections.stepIn(rows: ids, hasAdd: hasAdd), in: column)
            default:
                switch BoardSections.onSection(key, section: .column(column), order: sectionOrder) {
                case .section(let next): moveSection(to: next)
                case .stepIn: place(BoardSections.stepIn(rows: ids, hasAdd: hasAdd), in: column)
                case .sidebar(let id): enterSidebar(at: id)
                case .closeDetail, .none: break
                }
            }
            return
        }

        switch key {
        case .nextSection, .previousSection:
            moveSection(to: BoardSections.cycle(.column(column), by: key == .nextSection ? 1 : -1, in: sectionOrder))
            return
        case .back:
            // Out to the column, letting go of the todo.
            moveSection(to: .column(column))
            return
        case .down, .up:
            place(BoardSections.vertical(rows: ids, from: spot, by: key == .down ? 1 : -1, hasAdd: hasAdd), in: column)
            return
        case .left, .right:
            across(from: column, at: spot, by: key == .right ? 1 : -1)
            return
        default:
            break
        }

        guard case .row(let selected) = spot else {
            // On Add: Return starts typing; the row keys have nothing to act on.
            if key == .open { startTyping(in: column) }
            return
        }
        guard let todo = todos.first(where: { $0.id == selected }) else { return }
        if key == .open, column != Self.doneColumn {
            openWide(todo)
            return
        }
        act(key, on: todo, in: column, fromDetail: false)
    }

    /// Put the keyboard on a spot in a column (nil: on the column itself).
    func place(_ spot: ColumnSpot?, in column: String) {
        keySection = .column(column)
        if column != Self.doneColumn { focusedColumnId = column }
        switch spot {
        case .row(let id):
            addCursor = nil
            select(id, in: column)
        case .add:
            selectedTodoId = nil
            addCursor = column
        case nil:
            selectedTodoId = nil
            addCursor = nil
        }
    }

    /// ← → inside a column (see `BoardSections.across`).
    func across(from column: String, at spot: ColumnSpot, by offset: Int) {
        let board = KeyBoard(columns: keyColumns, rows: keyRows, done: Self.doneColumn, hasDetail: detailTodo != nil)
        let move = BoardSections.across(from: column, at: spot, by: offset, in: board)
        switch move {
        case .sidebar(let column):
            enterSidebar(at: column)
        case .detail:
            moveSection(to: .detail)
        case .column(let next, let spot):
            if next != Self.doneColumn { scrollColumnId = next }
            place(spot, in: next)
        case .none:
            break
        }
    }

    // MARK: - On the open todo

    /// The open todo, with nothing being edited: Return steps into its
    /// title, Esc closes it, and the row keys act on it as on its row.
    func performOnDetail(_ key: BoardKey) {
        guard let todo = detailTodo else { return }
        switch BoardSections.onSection(key, section: .detail, order: sectionOrder) {
        case .section(let next):
            moveSection(to: next)
            return
        case .stepIn:
            detailFocusRequest = true
            return
        case .closeDetail:
            closeDetailToRow()
            return
        case .sidebar, .none:
            break
        }
        let column = todo.isCompleted
            ? Self.doneColumn
            : orderedLists.first { $0.id.lowercased() == todo.listKey?.lowercased() }?.id
        guard let column else { return }
        act(key, on: todo, in: column, fromDetail: true)
    }

    /// Esc while editing the open todo: out of the field, onto the todo.
    func stepOutOfDetail() {
        detailEditing = false
        keySection = .detail
        boardFocused = true
    }

    /// Esc on the open todo: close it and go back to its row.
    func closeDetailToRow() {
        let id = detailTodo?.id
        closeDetail()
        if let id, let todo = todos.first(where: { $0.id == id && !$0.isCompleted }) {
            selectWide(todo)
        }
    }

    // MARK: - Row keys

    /// A row key on `todo`, in `column`. Done and Delete hand the selection
    /// on; a move keeps it on the todo (`moveKeepingSelection`).
    func act(_ key: BoardKey, on todo: TodoItem, in column: String, fromDetail: Bool) {
        // Where Done and Delete hand the selection (a move keeps it).
        let neighbor = BoardNavigator.selection(after: .gone, of: todo.id, in: column, rows: keyRows(column)).todo

        // Done's rows: X or Return puts one back, Delete removes it.
        if column == Self.doneColumn {
            switch key {
            case .done, .open:
                selectedTodoId = neighbor
                actions.restoreFromDone(todo)
            case .delete:
                selectedTodoId = neighbor
                actions.delete(todo)
            default:
                break
            }
            return
        }

        switch key {
        case .done:
            selectedTodoId = neighbor
            actions.toggleDone(todo)
        case .pin:
            actions.togglePin(todo)
        case .due:
            if fromDetail {
                showsDueCalendar = true
            } else {
                openWide(todo)
                showsDueCalendar = true
            }
        case .delete:
            if fromDetail {
                // Back in the column, on the todo that took its place.
                closeDetail()
                place(neighbor.map(ColumnSpot.row), in: column)
            } else {
                selectedTodoId = neighbor
            }
            actions.delete(todo)
        case .moveTo:
            palette = .move(todo.id)
        case .openLink:
            // The first link, without opening the detail.
            let first = todo.urls.sorted { $0.position < $1.position }.first?.url ?? todo.pendingUrls.first
            if let first, let url = URL(string: first) {
                openURL(url)
            } else {
                actions.toasts.show("No link on this todo", action: nil)
            }
        case .move(let kind):
            guard let target = orderedLists.first(where: { $0.systemKind == kind }),
                  target.id.lowercased() != column.lowercased() else { return }
            moveKeepingSelection(todo, to: target.id)
        default:
            break
        }
    }

    /// Select a row in a column (or clear the selection), remembering it.
    func select(_ id: UUID?, in column: String) {
        selectedTodoId = id
        if let id { lastSelected[column] = id }
    }

    /// Move a todo by command (1/2/3, Move to…, Todo ▸ Move to, the board's
    /// menu). Unlike Done and Delete it stays selected, and the keyboard goes
    /// with it to its new column, as it does on Undo. Dragging doesn't come
    /// through here.
    func moveKeepingSelection(_ todo: TodoItem, to listId: String) {
        let from = todo.listKey
        actions.move(todo, toList: listId) {
            if selectedTodoId == todo.id, let from { follow(todo, to: from) }
        }
        follow(todo, to: listId)
    }

    /// Select `todo` in its new list's column, which scrolls into view as Go
    /// to does. Your list comes into the fourth column; with a todo open the
    /// detail keeps it, and the keyboard.
    private func follow(_ todo: TodoItem, to listId: String) {
        guard let list = orderedLists.first(where: { $0.id.lowercased() == listId.lowercased() }) else { return }
        let next = BoardNavigator.selection(after: .moved(to: list.id), of: todo.id, in: list.id, rows: [])
        select(next.todo, in: next.column)
        guard detailTodo == nil else { return }
        if !list.isSystem { openColumnId = list.id }
        focusedColumnId = list.id
        scrollColumnId = list.id
        keySection = .column(list.id)
        addCursor = nil
        boardFocused = true
    }
}
