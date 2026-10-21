//
//  BoardColumn.swift
//  Nylon Impossible
//
//  One column of the iPad board: an Archivo title and subline in a header of
//  fixed (Dynamic Type–scaled) height, so every column's title sits on the
//  same baseline, then a hairline, the quiet "+ Add" composer, and the rows.
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
    let onOpen: (TodoItem) -> Void
    /// A dropped todo, and the row it landed on (nil: the column itself).
    let onDrop: (UUID, TodoItem?) -> Void
    @ViewBuilder var accessory: () -> Accessory

    @ScaledMetric(relativeTo: .largeTitle) private var headerHeight = Theme.Wide.columnHeader
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
        .todoDropTarget(isTargeted: $isTargeted) { onDrop($0, nil) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)
            Text(title)
                .textStyle(Theme.Fonts.Role.columnTitle, tracking: Theme.Tracking.masthead)
                .foregroundStyle(Theme.Colors.ink)
                // Wraps (then shrinks a little) at large sizes in a narrow
                // column rather than clipping "This Week".
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            Text(subline)
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .lineLimit(2)
                .padding(.top, 10)
        }
        .frame(maxWidth: .infinity, minHeight: headerHeight, maxHeight: headerHeight, alignment: .bottomLeading)
        .overlay(alignment: .topTrailing) {
            accessory()
                .padding(.top, Theme.Space.s3)
                .padding(.trailing, Theme.Space.s3)
        }
        .padding(.horizontal, Theme.Wide.gutter)
        .padding(.bottom, 18)
    }

    private func row(_ todo: TodoItem) -> some View {
        TodoRow(
            todo: todo,
            subtasks: subtasks[todo.id] ?? [],
            actions: actions,
            isSelected: selectedId == todo.id,
            lists: lists
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
        onOpen: @escaping (TodoItem) -> Void,
        onDrop: @escaping (UUID, TodoItem?) -> Void
    ) {
        self.init(
            list: list, title: title, subline: subline, rows: rows, subtasks: subtasks, lists: lists,
            actions: actions, selectedId: selectedId, isTinted: false, overnight: overnight, empty: empty,
            composer: composer, onOpen: onOpen, onDrop: onDrop
        ) { EmptyView() }
    }
}
