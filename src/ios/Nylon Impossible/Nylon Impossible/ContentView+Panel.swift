//
//  ContentView+Panel.swift
//  Nylon Impossible
//
//  The fourth column's detail, what the board offers the menu bar, and drops
//  from other apps. Split from ContentView+Wide.swift; shared by the iPad
//  and the Mac.
//

import SwiftUI

private struct PanelTodoState: Equatable {
    let id: UUID?
    let done: Bool
}

extension ContentView {
    // MARK: - Detail

    /// The board, with what the fourth column's detail needs from outside
    /// it: checking off the todo it shows puts it away, as the row leaving
    /// the board would (opening one that's already done changes the id too,
    /// so it stays), and the detail follows the selection.
    var boardWithDetail: some View {
        board
            .onChange(of: PanelTodoState(id: detailTodo?.id, done: detailTodo?.isEffectivelyCompleted ?? false)) { old, new in
                if new.done, !old.done, old.id == new.id { closeDetail() }
            }
            .onChange(of: selectedTodoId) { _, id in followSelection(id) }
    }

    // MARK: - Panel and fourth column

    func showPanel(_ route: AccountRoute) {
        switch route {
        case .settings:
            #if os(macOS)
            // A Mac has a Settings window (⌘,); the sidebar's Settings opens it.
            if screenRoute == nil {
                openSettings()
                return
            }
            #endif
            widePanel = .settings
        }
    }

    /// Done in the fourth column: close the open todo and your list.
    func showDone() {
        detailTodo = nil
        openColumnId = nil
        showsDueCalendar = false
        boardFocused = true
    }

    /// Close the open todo; the fourth column goes back to what it covered.
    func closeDetail() {
        detailTodo = nil
        showsDueCalendar = false
        boardFocused = true
    }

    // MARK: - Selection

    /// Select a todo: the board's keys act on it, and an open detail
    /// follows it (see `followSelection`).
    func selectWide(_ todo: TodoItem) {
        selectedTodoId = todo.id
        let column = todo.isCompleted
            ? Self.doneColumn
            : boardColumns.first { $0.id.lowercased() == todo.listKey?.lowercased() }?.id
        if let column {
            lastSelected[column] = todo.id
            if column != Self.doneColumn { focusedColumnId = column }
        }
        boardFocused = true
    }

    /// A click or tap on a row: the selection takes the fill alone, without
    /// the keyboard's bar.
    func clickSelect(_ todo: TodoItem) {
        selectsByKeyboard = false
        selectWide(todo)
    }

    /// A second click (or a double click) opens the todo.
    func clickOpen(_ todo: TodoItem) {
        selectsByKeyboard = false
        openWide(todo)
    }

    /// Open a todo in the fourth column (a second click, or Return).
    func openWide(_ todo: TodoItem) {
        selectWide(todo)
        showsDueCalendar = false
        detailTodo = todo
    }

    /// While a todo is open, the detail follows the selection.
    func followSelection(_ id: UUID?) {
        guard detailTodo != nil, let id, detailTodo?.id != id,
              let todo = todos.first(where: { $0.id == id && !$0.isCompleted }) else { return }
        showsDueCalendar = false
        detailTodo = todo
    }

    /// Go into a column: select its last-selected todo, or its first.
    func focusColumn(_ id: String) {
        focusedColumnId = id
        scrollColumnId = id
        boardFocused = true
        guard let list = orderedLists.first(where: { $0.id == id }) else { return }
        let ids = rows(list).map(\.id)
        selectedTodoId = lastSelected[id].flatMap { ids.contains($0) ? $0 : nil } ?? ids.first
    }

    /// A click on a column's empty space: the column takes the keyboard, but
    /// no row is selected, so ↓ starts at its top.
    func softFocus(_ id: String) {
        selectsByKeyboard = false
        sidebarCursor = nil
        focusedColumnId = id
        selectedTodoId = nil
        boardFocused = true
    }

    /// One of your lists: open it in the fourth column and go into it.
    /// Clicking the open list again does the same; it doesn't close it.
    func openCollection(_ list: TodoListModel) {
        detailTodo = nil
        openColumnId = list.id
        focusColumn(list.id)
    }

    func rename(_ list: TodoListModel, to name: String) {
        renameText = name
        renamingList = list
        commitRename()
        renamingList = nil
    }

    // MARK: - Menus

    /// What the board offers the menus: its keys, whether a row is selected,
    /// and your lists for Move to.
    var commandHandler: BoardCommandHandler {
        BoardCommandHandler(
            keysEnabled: keyboardEnabled,
            hasSelection: selectedTodoId.map { id in todos.contains { $0.id == id } } ?? false,
            collections: collections.map { (id: $0.id, name: $0.name) },
            focusedListName: focusedColumn?.name,
            perform: { perform($0) },
            run: { run($0) }
        )
    }

    // MARK: - Drops from other apps

    /// Text or a link dropped on a column from another app: added there the
    /// way the composer would, a todo per line, with typed dates read.
    func addDropped(_ text: String, to list: TodoListModel) {
        let created = actions.add(draft: text, to: list.id, parseDates: true, userId: authService.userId)
        noteAdded(created, to: list.id)
        guard !created.isEmpty else { return }
        actions.toasts.show(created.count > 1 ? "\(created.count) added to \(list.name)" : "Added to \(list.name)", action: nil)
    }
}
