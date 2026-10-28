//
//  BoardColumn.swift
//  Nylon Impossible
//
//  One column of the board (iPad and Mac): the header (BoardColumnHeader),
//  a hairline, the quiet "+ Add" composer, and the rows. One click selects a
//  row; a click on the selection opens it in the fourth column.
//
//  The whole column takes a dropped todo, which moves it here (one list per
//  todo). Dropping onto a row places it just above that row, which is also
//  how rows reorder within a column. Rows open the wide context menu on
//  long-press or right-click.
//

import SwiftUI

struct BoardColumn<Accessory: View>: View {
    let list: TodoListModel
    let title: String
    let subline: String
    let rows: [TodoItem]
    let subtasks: [UUID: [TodoItem]]
    /// Every list in display order, for "Move to…".
    let lists: [TodoListModel]
    let actions: TodoActions
    var selectedId: UUID?
    /// A collection column has a faint tint, like the prototype.
    var isTinted = false
    var overnight: (text: String, dismiss: () -> Void)?
    var empty: (text: String, link: (text: String, action: () -> Void)?)
    let composer: Composer
    let onSelect: (TodoItem) -> Void
    let onOpen: (TodoItem) -> Void
    /// Your list's column: rename in place, and Rename in its ⋯ menu.
    var onRename: ((String) -> Void)?
    var isRenaming: Binding<Bool> = .constant(false)
    /// A dropped todo, and the row it landed on (nil: the column itself).
    let onDrop: (UUID, TodoItem?) -> Void
    /// Text or a link dragged in from another app, to add here.
    var onExternalDrop: ((String) -> Void)?
    @ViewBuilder var accessory: () -> Accessory

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isTargeted = false
    @State private var targetedRow: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Hairline()
                .padding(.horizontal, Theme.Wide.gutter)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let overnight {
                        OvernightLine(text: overnight.text, gutter: Theme.Wide.gutter, onDismiss: overnight.dismiss)
                            .transition(.opacity)
                    }
                    composer
                        .padding(.horizontal, Theme.Wide.gutter)
                    if rows.isEmpty {
                        EmptyLine(text: empty.text, link: empty.link)
                            .transition(.opacity)
                    }
                    ForEach(rows) { todo in
                        row(todo)
                    }
                }
                .padding(.top, Theme.Space.s2)
                .padding(.bottom, Theme.Space.s16)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(isTargeted ? Theme.Colors.fill : (isTinted ? Theme.Colors.surface : Theme.Colors.canvas))
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isTargeted)
        .animation(Theme.Motion.moving(reduceMotion: reduceMotion), value: overnight?.text)
        .todoDropTarget(isTargeted: $isTargeted, onExternal: onExternalDrop) { onDrop($0, nil) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private var header: some View {
        BoardColumnHeader(
            title: title,
            subline: subline,
            onRename: onRename,
            isRenaming: isRenaming,
            accessory: accessory
        )
    }

    private func row(_ todo: TodoItem) -> some View {
        TodoRow(
            todo: todo,
            subtasks: subtasks[todo.id] ?? [],
            actions: actions,
            isSelected: selectedId == todo.id,
            lists: lists,
            onSelect: { onSelect(todo) }
        ) {
            onOpen(todo)
        }
        .background(Theme.Colors.canvas.opacity(0.001))
        #if DEBUG
        .screenRouteMenuTarget(selectedId == todo.id)
        #endif
        .contextMenu { TodoContextMenu(todo: todo, lists: lists, actions: actions, style: .wide) }
        .todoDragSource(todo)
        // A 2pt line above the row it would land in front of.
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Theme.Colors.brand)
                .frame(height: 2)
                .padding(.horizontal, Theme.Wide.gutter)
                .opacity(targetedRow == todo.id ? 1 : 0)
                .accessibilityHidden(true)
        }
        .todoDropTarget(isTargeted: Binding(
            get: { targetedRow == todo.id },
            set: { isOver in
                if isOver {
                    targetedRow = todo.id
                } else if targetedRow == todo.id {
                    targetedRow = nil
                }
            }
        )) { onDrop($0, todo) }
        .transition(.opacity)
        .id(todo.id)
    }
}

extension BoardColumn where Accessory == EmptyView {
    init(
        list: TodoListModel,
        title: String,
        subline: String,
        rows: [TodoItem],
        subtasks: [UUID: [TodoItem]],
        lists: [TodoListModel],
        actions: TodoActions,
        selectedId: UUID?,
        overnight: (text: String, dismiss: () -> Void)?,
        empty: (text: String, link: (text: String, action: () -> Void)?),
        composer: Composer,
        onSelect: @escaping (TodoItem) -> Void,
        onOpen: @escaping (TodoItem) -> Void,
        onDrop: @escaping (UUID, TodoItem?) -> Void,
        onExternalDrop: ((String) -> Void)? = nil
    ) {
        self.init(
            list: list, title: title, subline: subline, rows: rows, subtasks: subtasks, lists: lists,
            actions: actions, selectedId: selectedId, isTinted: false, overnight: overnight, empty: empty,
            composer: composer, onSelect: onSelect, onOpen: onOpen, onDrop: onDrop,
            onExternalDrop: onExternalDrop
        ) { EmptyView() }
    }
}
