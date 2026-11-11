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

    /// The board's sections, in Tab order.
    var sectionOrder: [BoardSection] {
        BoardSections.order(columns: keyColumns, hasDetail: detailTodo != nil)
    }

    /// The section with the keyboard: the sidebar while its cursor is out,
    /// else where a key or a click last put it, else the column holding the
    /// selection, else the focused column (Today at launch).
    var currentSection: BoardSection {
        if sidebarCursor != nil { return .sidebar }
        let order = sectionOrder
        if let keySection, order.contains(keySection) { return keySection }
        if let column = selectionColumn, order.contains(.column(column)) { return .column(column) }
        if let id = focusedColumn?.id { return .column(id) }
        return order.dropFirst().first ?? .sidebar
    }

    /// The outline goes on the section with the keyboard once a key has
    /// moved it, and comes off with a pointer press (States, "Keyboard or
    /// pointer").
    func showsOutline(_ section: BoardSection) -> Bool {
        selectsByKeyboard && currentSection == section
    }

    /// Where the keyboard is inside a column, or nil when it's on the column.
    func spot(in column: String) -> ColumnSpot? {
        if addCursor == column { return .add }
        if let id = selectedTodoId, keyRows(column).contains(id) { return .row(id) }
        return nil
    }

    func perform(_ key: BoardKey) {
        // A press the menu and onKeyPress both saw is one press.
        if let last = lastKey, last.key == key, Date().timeIntervalSince(last.at) < 0.05 { return }
        lastKey = (key, Date())
        selectsByKeyboard = true

        // Keys that work from anywhere on the board.
        switch key {
        case .new:
            newTodoHere()
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

        // Editing the open todo, only Esc reaches the board: back out to it.
        if detailEditing {
            if key == .back { stepOutOfDetail() }
            return
        }

        switch currentSection {
        case .sidebar: performInSidebar(key)
        case .column(let column): performInColumn(key, column: column)
        case .detail: performOnDetail(key)
        }
    }

    /// n: typing in this column's Add, or quick add where there's no Add.
    func newTodoHere() {
        if let column = BoardSections.addColumn(for: currentSection, done: Self.doneColumn) {
            startTyping(in: column)
        } else {
            showsQuickAdd = true
        }
    }

    /// Onto a section, with nothing inside it selected.
    func moveSection(to section: BoardSection) {
        sidebarCursor = nil
        addCursor = nil
        // The open todo keeps its row selected, as opening it does.
        selectedTodoId = section == .detail ? detailTodo?.id : nil
        keySection = section
        if case .column(let id) = section, id != Self.doneColumn {
            focusedColumnId = id
            scrollColumnId = id
        }
    }

    /// Into the sidebar, on `column`'s item.
    func enterSidebar(at column: String?) {
        addCursor = nil
        selectedTodoId = nil
        keySection = .sidebar
        sidebarCursor = sidebarItem(for: column)
    }

    /// The cursor in a column's Add field.
    func startTyping(in column: String) {
        addCursor = column
        selectedTodoId = nil
        keySection = .column(column)
        requestComposer(column)
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

    /// Keys while the keyboard is on or in the sidebar. On it, Return (or
    /// ↓ ↑) steps in at the item for the column you came from. In it, ↑ ↓
    /// move, → or Return go into a column (Return presses New list,
    /// Settings and Keyboard shortcuts), and Esc steps back out.
    private func performInSidebar(_ key: BoardKey) {
        guard let cursor = sidebarCursor else {
            switch key {
            case .down, .up:
                enterSidebar(at: lastColumnSection ?? focusedColumn?.id)
            default:
                switch BoardSections.onSection(key, section: .sidebar, order: sectionOrder) {
                case .section(let next): moveSection(to: next)
                case .stepIn: enterSidebar(at: lastColumnSection ?? focusedColumn?.id)
                case .sidebar, .closeDetail, .none: break
                }
            }
            return
        }
        let items = sidebarItems
        let at = items.firstIndex(of: cursor) ?? 0
        switch key {
        case .down, .up:
            sidebarCursor = items[BoardNavigator.column(at, by: key == .down ? 1 : -1, count: items.count)]
        case .back:
            sidebarCursor = nil
            keySection = .sidebar
        case .nextSection, .previousSection:
            moveSection(to: BoardSections.cycle(.sidebar, by: key == .nextSection ? 1 : -1, in: sectionOrder))
        case .right:
            if case .newList = cursor { return }
            if cursor == .settings || cursor == .shortcuts { return }
            activate(cursor)
        case .open:
            activate(cursor)
        default:
            break
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
            keySection = .sidebar
            newListAnchor = .sidebar
        case .done:
            showDone()
            selectDone()
        case .settings:
            keySection = .sidebar
            showPanel(.settings)
        case .shortcuts:
            keySection = .sidebar
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
        keySection = .column(Self.doneColumn)
        addCursor = nil
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
            // ⌘N is always quick add; n is "add here".
            showsQuickAdd = true
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
            guard let id = selectedTodoId,
                  let todo = todos.first(where: { $0.id == id }),
                  todo.listKey?.lowercased() != listId.lowercased() else { return }
            moveKeepingSelection(todo, to: listId)
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
            // The phone's Done page is the board's resting fourth column.
            if viewModel.page == .done { openColumnId = nil }
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
