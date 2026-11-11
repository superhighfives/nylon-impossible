//
//  BoardColumn.swift
//  Nylon Impossible
//
//  One column of the board (iPad and Mac): the header (BoardColumnHeader),
//  a hairline, the quiet "+ Add" composer, and the rows. One click selects a
//  row; a click on the selection opens it in the fourth column. A click on
//  empty space focuses the column without selecting a row.
//
//  The whole column takes a dropped todo, which moves it here (one list per
//  todo), into the gap nearest the pointer (BoardDrop): over a row's upper
//  half, above it; over its lower half, below it; under the last row,
//  including the bottom padding, last. That's also how rows reorder within a
//  column. A drop on the header or the composer moves a todo from another
//  column to the end and leaves one from this column where it is. A 2pt
//  line marks where it will land, and the column itself never tints
//  (PRINCIPLES.md, States: "Column as a drop target"). Rows open the wide
//  context menu on long-press or right-click.
//

import SwiftUI
import UniformTypeIdentifiers

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
    /// Your list's column: the list icon at the start of the subline.
    var icon: String?
    /// Today's overnight pill: its line, what its text does, and dismiss.
    var overnight: (line: OvernightNote.Line, see: () -> Void, dismiss: () -> Void)?
    var empty: (text: String, link: (text: String, action: () -> Void)?)
    let composer: Composer
    /// The keyboard is on Add without typing: it shows as a row selected by
    /// keyboard does.
    var addSelected = false
    let onSelect: (TodoItem) -> Void
    let onOpen: (TodoItem) -> Void
    /// Your list's column: rename in place, and Rename in its ⋯ menu.
    var onRename: ((String) -> Void)?
    var isRenaming: Binding<Bool> = .constant(false)
    /// A dropped todo, and the slot among the column's other rows the
    /// pointer was over, not yet clamped to its tier (BoardDrop.slot). Nil:
    /// the header or the composer, the column itself.
    let onDrop: (UUID, Int?) -> Void
    /// Text or a link dragged in from another app, to add here.
    var onExternalDrop: ((String) -> Void)?
    /// A click on the column's empty space: focus the column, select nothing.
    var onBackgroundTap: () -> Void = {}
    /// The context menu's Move: the todo stays selected in its new column.
    var onMove: ((TodoItem, String) -> Void)?
    @ViewBuilder var accessory: () -> Accessory

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Where the drop line is, in the rows' coordinates; nil for none.
    @State private var dropLine: CGFloat?
    @State private var geometry = DropGeometry()

    private static var columnSpace: String { "boardColumn" }
    private static var rowsSpace: String { "boardColumnRows" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Hairline()
                .padding(.horizontal, Theme.Wide.gutter)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    composer
                        .background { addHighlight }
                        .padding(.horizontal, Theme.Wide.gutter)
                        .onGeometryChange(for: CGFloat.self) {
                            $0.frame(in: .named(Self.rowsSpace)).maxY
                        } action: { geometry.composerBottom = $0 }
                    if rows.isEmpty {
                        EmptyLine(text: empty.text, link: empty.link)
                            .transition(.opacity)
                    }
                    ForEach(rows) { todo in
                        row(todo)
                    }
                }
                .coordinateSpace(.named(Self.rowsSpace))
                .onGeometryChange(for: CGFloat.self) {
                    $0.frame(in: .named(Self.columnSpace)).minY
                } action: { geometry.rowsOrigin = $0 }
                .overlay(alignment: .top) { dropLineView }
                .padding(.top, Theme.Space.s2)
                .padding(.bottom, Theme.Space.s16)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .onGeometryChange(for: CGFloat.self) {
                $0.frame(in: .named(Self.columnSpace)).minY
            } action: { geometry.viewportTop = $0 }
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(isTinted ? Theme.Colors.surface : Theme.Colors.canvas)
        .background {
            Color.clear.contentShape(Rectangle()).onTapGesture(perform: onBackgroundTap)
        }
        .animation(Theme.Motion.moving(reduceMotion: reduceMotion), value: overnight?.line)
        .coordinateSpace(.named(Self.columnSpace))
        .onDrop(
            of: TodoDropLoader.types(external: onExternalDrop != nil),
            delegate: ColumnDropDelegate(
                external: onExternalDrop != nil,
                hover: hover,
                drop: drop
            )
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private var header: some View {
        BoardColumnHeader(
            title: title,
            subline: subline,
            icon: icon,
            onRename: onRename,
            isRenaming: isRenaming,
            banner: overnight.map { note in
                AnyView(OvernightPill(line: note.line, onSee: note.see, onDismiss: note.dismiss).transition(.opacity))
            },
            accessory: accessory
        )
    }

    /// A row's keyboard selection, the `fill` and the `inkMuted` bar,
    /// behind Add while the keyboard is on it.
    private var addHighlight: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
            .fill(Theme.Colors.fill)
            .opacity(addSelected ? 1 : 0)
            .padding(.horizontal, -10)
            .overlay(alignment: .leading) { RowSelectionBar(isOn: addSelected) }
            .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: addSelected)
            .accessibilityHidden(true)
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
        .contextMenu { TodoContextMenu(todo: todo, lists: lists, actions: actions, style: .wide, onMove: onMove) }
        .todoDragSource(todo)
        .onGeometryChange(for: CGRect.self) {
            $0.frame(in: .named(Self.rowsSpace))
        } action: { frame in
            geometry.spans[todo.id] = BoardDrop.Span(top: frame.minY, bottom: frame.maxY)
        }
        // A lazy stack lets go of rows far out of view; BoardDrop places
        // them by order instead.
        .onDisappear { geometry.spans[todo.id] = nil }
        .transition(.opacity)
        .id(todo.id)
    }

    // MARK: - Drop

    /// The 2pt line in the gap the drop would land in.
    @ViewBuilder
    private var dropLineView: some View {
        if let y = dropLine {
            Rectangle()
                .fill(Theme.Colors.brand)
                .frame(height: 2)
                .padding(.horizontal, Theme.Wide.gutter)
                .offset(y: y - 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private var dropRows: [BoardDrop.Row] {
        rows.map { BoardDrop.Row(id: $0.id, pinned: $0.pinned, span: geometry.spans[$0.id]) }
    }

    /// Where the rows start, in their own coordinates: below the composer,
    /// and below the header when they're scrolled up under it.
    private var rowsTop: CGFloat {
        max(geometry.composerBottom, geometry.viewportTop - geometry.rowsOrigin)
    }

    /// A drag moved over the column (at `location`, in its coordinates), or
    /// left it (nil). `ours` is false for something from another app. Once
    /// our drag has landed its session is over, so an update that arrives
    /// after the drop clears the line rather than redrawing it.
    private func hover(_ location: CGPoint?, ours: Bool) {
        guard let location, ours, let drag = TodoDragSession.current else {
            dropLine = nil
            return
        }
        let rows = dropRows
        let y = location.y - geometry.rowsOrigin
        let pinned = rows.first { $0.id == drag.id }?.pinned ?? drag.pinned
        let line = BoardDrop.line(rows: rows, dragged: drag.id, pinned: pinned, y: y, rowsTop: rowsTop)
        if line != dropLine { dropLine = line }
    }

    /// Something landed at `location`.
    private func drop(_ item: ExternalDrop, at location: CGPoint) {
        switch item {
        case .todo(let id):
            TodoDragSession.end()
            dropLine = nil
            let y = location.y - geometry.rowsOrigin
            onDrop(id, BoardDrop.slot(rows: dropRows, dragged: id, y: y, rowsTop: rowsTop))
        case .drafts(let text):
            onExternalDrop?(text)
        }
    }
}

/// The geometry a drop needs, kept out of view state: it changes on every
/// scroll, and only a drag reads it.
private final class DropGeometry {
    /// Each laid-out row's extent, in the rows' coordinates.
    var spans: [UUID: BoardDrop.Span] = [:]
    /// The composer's bottom, in the rows' coordinates.
    var composerBottom: CGFloat = 0
    /// The rows' origin, in the column's coordinates (moves as it scrolls).
    var rowsOrigin: CGFloat = 0
    /// The scroll view's top, in the column's coordinates.
    var viewportTop: CGFloat = 0
}

/// A column's drop target: follows the pointer for the line, and loads what
/// landed through the same path as `todoDropTarget`.
private struct ColumnDropDelegate: DropDelegate {
    let external: Bool
    let hover: (CGPoint?, _ ours: Bool) -> Void
    let drop: (ExternalDrop, CGPoint) -> Void

    /// A row carries plain text and no link; a link is from another app.
    private func isOurs(_ info: DropInfo) -> Bool {
        !info.hasItemsConforming(to: [.url])
    }

    func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: TodoDropLoader.types(external: external))
    }

    func dropEntered(info: DropInfo) {
        hover(info.location, isOurs(info))
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        hover(info.location, isOurs(info))
        return nil
    }

    func dropExited(info: DropInfo) {
        hover(nil, false)
    }

    func performDrop(info: DropInfo) -> Bool {
        let location = info.location
        hover(nil, false)
        return TodoDropLoader.load(
            info.itemProviders(for: TodoDropLoader.types(external: external)),
            external: external
        ) { drop($0, location) }
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
        overnight: (line: OvernightNote.Line, see: () -> Void, dismiss: () -> Void)?,
        empty: (text: String, link: (text: String, action: () -> Void)?),
        composer: Composer,
        addSelected: Bool = false,
        onSelect: @escaping (TodoItem) -> Void,
        onOpen: @escaping (TodoItem) -> Void,
        onDrop: @escaping (UUID, Int?) -> Void,
        onExternalDrop: ((String) -> Void)? = nil,
        onBackgroundTap: @escaping () -> Void = {},
        onMove: ((TodoItem, String) -> Void)? = nil
    ) {
        self.init(
            list: list, title: title, subline: subline, rows: rows, subtasks: subtasks, lists: lists,
            actions: actions, selectedId: selectedId, isTinted: false, overnight: overnight, empty: empty,
            composer: composer, addSelected: addSelected, onSelect: onSelect, onOpen: onOpen, onDrop: onDrop,
            onExternalDrop: onExternalDrop, onBackgroundTap: onBackgroundTap, onMove: onMove
        ) { EmptyView() }
    }
}
