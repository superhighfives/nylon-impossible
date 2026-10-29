//
//  ContentView+WideKeys.swift
//  Nylon Impossible
//
//  The iPad board's keyboard map in action, and carrying state across a
//  switch between the board and the phone layout. Split from
//  ContentView+Wide.swift.
//

import SwiftUI

extension ContentView {
    // MARK: - Keyboard

    /// The columns the keys move across, left to right: the time lists,
    /// your list or Done in the fourth (not under an open todo).
    var keyColumns: [String] {
        boardColumns.map(\.id) + (doneShowing ? [Self.doneColumn] : [])
    }

    /// A column's rows, by id: a list's open todos, or Done's.
    func keyRows(_ column: String) -> [UUID] {
        if column == Self.doneColumn { return doneTodos.map(\.id) }
        return orderedLists.first { $0.id == column }.map { rows($0).map(\.id) } ?? []
    }

    func perform(_ key: BoardKey) {
        // A press the menu and onKeyPress both saw is one press.
        if let last = lastKey, last.key == key, Date().timeIntervalSince(last.at) < 0.05 { return }
        lastKey = (key, Date())

        if sidebarCursor != nil, performInSidebar(key) { return }

        // Keys that work from anywhere on the board.
        switch key {
        case .back:
            if detailTodo != nil {
                closeDetail()
            } else {
                sidebarCursor = sidebarItem(for: selectionColumn ?? focusedColumn?.id)
            }
            return
        case .new:
            showsQuickAdd = true
            return
        case .newList:
            newListAnchor = .toolbar
            return
        case .go:
            startGo()
            return
        case .goToList:
            palette = .lists
            return
        case .shortcuts:
            showsShortcuts.toggle()
            return
        case .jump(let target):
            jump(target)
            return
        default:
            break
        }

        let columns = keyColumns
        let current = selectionColumn.flatMap { columns.contains($0) ? $0 : nil }
            ?? focusedColumn?.id ?? columns.first
        guard let column = current, let columnIndex = columns.firstIndex(of: column) else { return }
        let ids = keyRows(column)
        let selected = selectedTodoId.flatMap { ids.contains($0) ? $0 : nil }

        switch key {
        case .down, .up:
            if column != Self.doneColumn { focusedColumnId = column }
            select(BoardNavigator.step(ids, from: selected, by: key == .down ? 1 : -1), in: column)
            return
        case .left where columnIndex == 0:
            // Out of the board, into the sidebar at this column's item.
            sidebarCursor = sidebarItem(for: column)
            return
        case .left, .right:
            let next = columns[BoardNavigator.column(columnIndex, by: key == .right ? 1 : -1, count: columns.count)]
            if next != Self.doneColumn {
                focusedColumnId = next
                scrollColumnId = next
            }
            select(BoardNavigator.across(from: ids, current: selected, to: keyRows(next)), in: next)
            return
        default:
            break
        }

        guard let selected, let todo = todos.first(where: { $0.id == selected }) else { return }
        let neighbor = BoardNavigator.neighbor(of: selected, in: ids)

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
        case .open:
            openWide(todo)
        case .pin:
            actions.togglePin(todo)
        case .due:
            openWide(todo)
            showsDueCalendar = true
        case .delete:
            selectedTodoId = neighbor
            actions.delete(todo)
        case .moveTo:
            palette = .move(todo.id)
        case .move(let kind):
            guard let target = orderedLists.first(where: { $0.systemKind == kind }),
                  target.id.lowercased() != column.lowercased() else { return }
            selectedTodoId = neighbor
            actions.move(todo, toList: target.id)
        default:
            break
        }
    }

    /// Select a row in a column (or clear the selection), remembering it.
    private func select(_ id: UUID?, in column: String) {
        selectedTodoId = id
        if let id { lastSelected[column] = id }
    }

    // MARK: - Sidebar

    /// The sidebar's items, top to bottom, as the keyboard visits them.
    var sidebarItems: [SidebarItem] {
        timeColumns.map { .list($0.id) } + collections.map { .list($0.id) }
            + [.newList, .done, .settings, .shortcuts]
    }

    func sidebarItem(for column: String?) -> SidebarItem {
        guard let column else { return sidebarItems.first ?? .done }
        return column == Self.doneColumn ? .done : .list(column)
    }

    /// Keys while the keyboard is in the sidebar. ↑ ↓ move, → or Return go
    /// into a column (Return presses New list, Settings and Keyboard
    /// shortcuts). Anything else leaves the sidebar and does its usual job.
    private func performInSidebar(_ key: BoardKey) -> Bool {
        guard let cursor = sidebarCursor else { return false }
        let items = sidebarItems
        let at = items.firstIndex(of: cursor) ?? 0
        switch key {
        case .down, .up:
            sidebarCursor = items[BoardNavigator.column(at, by: key == .down ? 1 : -1, count: items.count)]
            return true
        case .left, .back:
            return true
        case .right:
            if case .newList = cursor { return true }
            if cursor == .settings || cursor == .shortcuts { return true }
            activate(cursor)
            return true
        case .open:
            activate(cursor)
            return true
        default:
            sidebarCursor = nil
            return false
        }
    }

    /// A sidebar item, as a click (or Return) would have it.
    func activate(_ item: SidebarItem) {
        sidebarCursor = nil
        switch item {
        case .list(let id):
            guard let list = orderedLists.first(where: { $0.id == id }) else { return }
            if list.isSystem { focusColumn(id) } else { openCollection(list) }
        case .newList:
            newListAnchor = .sidebar
        case .done:
            showDone()
            selectDone()
        case .settings:
            showPanel(.settings)
        case .shortcuts:
            showsShortcuts = true
        }
    }

    // MARK: - Jumps

    /// Go into a column, back to its last selection (or `rowId`).
    func jump(_ target: BoardJump, rowId: UUID? = nil) {
        sidebarCursor = nil
        switch target {
        case .time(let kind):
            guard let list = orderedLists.first(where: { $0.systemKind == kind }) else { return }
            focusColumn(list.id)
        case .list(let index):
            guard collections.indices.contains(index) else { return }
            openCollection(collections[index])
        case .done:
            showDone()
            selectDone()
        }
        if let rowId { selectedTodoId = rowId }
    }

    /// Done's last selection, or its first row.
    func selectDone() {
        let ids = doneTodos.map(\.id)
        selectedTodoId = lastSelected[Self.doneColumn].flatMap { ids.contains($0) ? $0 : nil } ?? ids.first
    }

    /// G: the next key (within 1.2 seconds) is a destination.
    func startGo() {
        goTask?.cancel()
        goPending = true
        goTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1200))
            guard !Task.isCancelled else { return }
            goPending = false
        }
    }

    /// The key after G: its destination, or nil to let it do its usual job.
    func takeGo(_ characters: String) -> BoardKey? {
        guard goPending else { return nil }
        goPending = false
        goTask?.cancel()
        return BoardKey.afterGo(characters)
    }

    /// A menu command that isn't one of the board's single keys: File ▸ New
    /// List, View ▸ Today / This week / Someday / Show Done, the details
    /// toggle, and Todo ▸ Move to ▸ one of your lists.
    func run(_ command: BoardMenuCommand) {
        switch command {
        case .key(let key):
            perform(key)
        case .newTodo:
            perform(.new)
        case .newList:
            newListAnchor = .toolbar
        case .search:
            palette = palette == nil ? .all : nil
        case .showList(let kind):
            guard let list = orderedLists.first(where: { $0.systemKind == kind }) else { return }
            focusColumn(list.id)
        case .showDone:
            jump(.done)
        case .moveToList(let listId):
            guard let column = focusedColumn,
                  let id = selectedTodoId,
                  let todo = todos.first(where: { $0.id == id }),
                  todo.listKey?.lowercased() != listId.lowercased() else { return }
            selectedTodoId = BoardNavigator.neighbor(of: id, in: rows(column).map(\.id))
            actions.move(todo, toList: listId)
        }
    }

    // MARK: - Size-class changes

    /// Carry what's open across a switch between the board and the phone
    /// layout (rotation, split view, Stage Manager resizing).
    func carryAcross(toWide wide: Bool) {
        if wide {
            if showsAccount {
                // Done is the board's fourth column already; Settings comes
                // across as the board's sheet.
                if accountPath.last == .settings { widePanel = .settings }
                showsAccount = false
                accountPath = []
            }
            if viewModel.page == .lists, let id = viewModel.openCollectionId {
                openColumnId = id
            }
            if focusedColumnId == nil {
                focusedColumnId = (viewModel.openCollectionId.flatMap { id in openColumnId == id ? id : nil })
                    ?? timeList(viewModel.page)?.id ?? timeList(.today)?.id
            }
            boardFocused = true
        } else {
            if let id = focusedColumnId ?? openColumnId,
               let list = orderedLists.first(where: { $0.id == id }) {
                if let page = Page(systemKind: list.systemKind) {
                    viewModel.openCollectionId = nil
                    viewModel.page = page
                } else {
                    viewModel.page = .lists
                    viewModel.openCollectionId = list.id
                }
            }
            if let route = widePanel {
                widePanel = nil
                if detailTodo == nil {
                    accountPath = [route]
                    accountDetent = .large
                    // Let the phone layout land before presenting over it.
                    Task { @MainActor in showsAccount = true }
                }
            }
        }
    }
}
