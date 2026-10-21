//
//  ListPage.swift
//  Nylon Impossible
//
//  One list's page: the masthead, then its rows, or a written empty line.
//  Used for the three time lists and for a pushed collection.
//
//  Rows reorder with `List.onMove` (long-press, then drag). The same drag can
//  leave the list and land on a switcher title, because each row also vends
//  its id through `itemProvider`. Long-press without moving opens the context
//  menu instead.
//

import SwiftUI

struct ListPage<Header: View>: View {
    let list: TodoListModel
    let rows: [TodoItem]
    /// Subtasks by parent, for the meta line's n/m.
    let subtasks: [UUID: [TodoItem]]
    /// Every list in display order, for "Move to …".
    let lists: [TodoListModel]
    let actions: TodoActions
    var empty: (text: String, link: (text: String, action: () -> Void)?)
    let onOpen: (TodoItem) -> Void
    @ViewBuilder var header: () -> Header

    @Environment(\.composerClearance) private var composerClearance

    var body: some View {
        List {
            header()
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .moveDisabled(true)

            if rows.isEmpty {
                EmptyLine(text: empty.text, link: empty.link)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .transition(.opacity)
            }

            ForEach(rows) { todo in
                TodoRow(todo: todo, subtasks: subtasks[todo.id] ?? [], actions: actions, lists: lists) {
                    onOpen(todo)
                }
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Theme.Colors.canvas)
                .contextMenu { TodoContextMenu(todo: todo, lists: lists, actions: actions) }
                .itemProvider { NSItemProvider(object: todo.id.uuidString as NSString) }
            }
            .onMove { source, destination in
                actions.viewModel.moveTodo(from: source, to: destination, in: rows)
                actions.edited()
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .environment(\.defaultMinListRowHeight, 0)
        .contentMargins(.top, Theme.Space.s2, for: .scrollContent)
        .contentMargins(.bottom, Theme.Space.s6 + composerClearance, for: .scrollContent)
    }
}

extension EnvironmentValues {
    /// Height of the floating composer, so the last row can scroll clear of it.
    @Entry var composerClearance: CGFloat = 0
}
