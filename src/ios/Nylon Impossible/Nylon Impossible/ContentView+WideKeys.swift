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

    func perform(_ key: BoardKey) {
        // A press the menu and onKeyPress both saw is one press.
        if let last = lastKey, last.key == key, Date().timeIntervalSince(last.at) < 0.05 { return }
        lastKey = (key, Date())

        let columns = boardColumns
        guard let column = focusedColumn, let columnIndex = columns.firstIndex(where: { $0.id == column.id }) else { return }
        let ids = rows(column).map(\.id)
        let selected = selectedTodoId.flatMap { ids.contains($0) ? $0 : nil }

        switch key {
        case .down, .up:
            focusedColumnId = column.id
            selectedTodoId = BoardNavigator.step(ids, from: selected, by: key == .down ? 1 : -1)
            return
        case .left, .right:
            let next = columns[BoardNavigator.column(columnIndex, by: key == .right ? 1 : -1, count: columns.count)]
            selectedTodoId = BoardNavigator.across(from: ids, current: selected, to: rows(next).map(\.id))
            focusedColumnId = next.id
            scrollColumnId = next.id
            return
        case .new:
            requestComposer(column.id)
            return
        default:
            break
        }

        guard let selected, let todo = todos.first(where: { $0.id == selected }) else { return }
        let neighbor = BoardNavigator.neighbor(of: selected, in: ids)
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
        case .move(let kind):
            guard let target = orderedLists.first(where: { $0.systemKind == kind }),
                  target.id.lowercased() != column.id.lowercased() else { return }
            selectedTodoId = neighbor
            actions.move(todo, toList: target.id)
        default:
            break
        }
    }

    // MARK: - Size-class changes

    /// Carry what's open across a switch between the board and the phone
    /// layout (rotation, split view, Stage Manager resizing).
    func carryAcross(toWide wide: Bool) {
        if wide {
            if showsAccount {
                widePanel = accountPath.last
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
