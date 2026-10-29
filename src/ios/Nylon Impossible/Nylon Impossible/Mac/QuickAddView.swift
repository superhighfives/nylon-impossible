//
//  QuickAddView.swift
//  Nylon Impossible
//
//  Quick add, from the menu bar or the global hotkey: the composer — list
//  chips, the "Due Fri ×" chip from `TodoDateParser`, Return adds and keeps
//  the field focused for the next one — over today's count and the next few
//  todos for today, each with its checkbox. "Today" here is `TodayDigest`, the
//  same set the widget and the Dock badge show.
//
//  The menu bar extra and the hotkey panel are the same view; the panel drops
//  the footer (Settings and Quit are already one click away in the menu bar).
//
//  It works without the mouse. The field takes focus every time the panel
//  opens (the panel is reused, so `onAppear` only fires once). The list chips
//  show once you type; ⇥ and ⇧⇥ step through them, and picking one shows that
//  list, so the todo lands where you're looking. Return adds and stays; Esc
//  clears the field, then closes. ↓ goes into the list, where the selected
//  row has the board's ring and letters are shortcuts: ↵ opens Nylon, X done
//  (staying in the slot), P pin (following the todo), O its link; ↑ from the
//  top row, Esc or N go back to the field.
//

#if os(macOS)
import SwiftData
import SwiftUI

struct QuickAddView: View {
    enum Presentation { case menuBar, panel }

    let presentation: Presentation
    var onDismiss: () -> Void = {}

    @Environment(\.modelContext) private var modelContext
    @Environment(\.screenRoute) private var screenRoute
    @Environment(AuthService.self) private var authService
    @Environment(SyncService.self) private var syncService
    @Query(sort: \TodoItem.createdAt, order: .reverse) private var todos: [TodoItem]
    @Query(sort: \TodoListModel.position) private var lists: [TodoListModel]

    @State private var actions = TodoActions()
    @State private var text = ""
    @State private var chosenListId: String?
    @State private var focusRequested = true
    /// The keyboard's row in the list, by id; `cursorSlot` keeps its place
    /// when a done todo leaves.
    @State private var cursorId: UUID?
    @State private var cursorSlot = 0
    @FocusState private var listFocused: Bool
    @Environment(\.openURL) private var openURL

    /// How many of today's todos the list shows before "+N more".
    static let rowLimit = 5
    static let width: CGFloat = 380

    private var userId: String? {
        screenRoute != nil ? "sample-user" : authService.userId
    }

    private var orderedLists: [TodoListModel] {
        lists.filter { !$0.isSystem || $0.systemKind != nil }.sorted { a, b in
            if a.isSystem != b.isSystem { return a.isSystem }
            if a.isSystem && b.isSystem { return a.systemSortIndex < b.systemSortIndex }
            return a.position < b.position
        }
    }

    private var todayList: TodoListModel? {
        orderedLists.first { $0.systemKind == .today }
    }

    private var today: [TodoItem] {
        TodayDigest.select(todos, todayListId: todayList?.id, userId: userId)
            .filter { !actions.pendingDeletes.contains($0.id) }
    }

    /// The list the popover shows and adds to: the chip picked, else Today.
    private var targetList: TodoListModel? {
        chosenListId.flatMap { id in orderedLists.first { $0.id == id } } ?? todayList
    }

    /// Today's digest, or the picked list's open todos.
    private var rows: [TodoItem] {
        guard let list = targetList, list.id != todayList?.id else { return today }
        return actions.viewModel.pageTodos(from: todos, listId: list.id, hidden: actions.pendingDeletes)
    }

    private var subtasksByParent: [UUID: [TodoItem]] {
        Dictionary(grouping: todos.filter { $0.parentId != nil && !$0.isSoftDeleted }) { $0.parentId ?? UUID() }
    }

    var body: some View {
        Group {
            if userId == nil {
                signedOut
            } else {
                content
            }
        }
        .frame(width: Self.width)
        .background(Theme.Colors.canvas)
        .environment(\.isWideLayout, true)
        .task {
            actions.configure(context: modelContext) { syncService.syncAfterAction() }
        }
        .onExitCommand(perform: onDismiss)
        // The panel is reused, so take the field every time it opens.
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { note in
            guard note.object is QuickAddPanel else { return }
            backToField()
        }
    }

    private var content: some View {
        let all = rows
        let shown = Array(all.prefix(Self.rowLimit))
        let subtasks = subtasksByParent
        let cursor = cursorRow(in: shown)
        return VStack(alignment: .leading, spacing: 0) {
            header(count: all.count)
            Composer(
                text: $text,
                lists: orderedLists,
                currentListId: todayList?.id,
                chosenListId: $chosenListId,
                focusRequested: $focusRequested,
                onSubmit: add,
                style: .inline,
                onEscape: {
                    // Esc clears the field, then closes.
                    if text.isEmpty {
                        onDismiss()
                    } else {
                        text = ""
                        focusRequested = true
                    }
                },
                menuBarKeys: true,
                onDown: { intoList(shown) }
            )
            .padding(.horizontal, Theme.Space.s4)
            Hairline()
                .padding(.horizontal, Theme.Space.s4)
                .padding(.top, Theme.Space.s1)
            if shown.isEmpty {
                Text("Nothing for today.")
                    .textStyle(Theme.Fonts.Role.bodyWide)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.horizontal, Theme.Space.s4)
                    .padding(.vertical, Theme.Space.s4)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(shown) { todo in
                        TodoRow(
                            todo: todo,
                            subtasks: subtasks[todo.id] ?? [],
                            actions: actions,
                            isSelected: listFocused && cursor?.id == todo.id,
                            lists: orderedLists
                        ) {
                            MacServices.shared.showMainWindow()
                            onDismiss()
                        }
                        .contextMenu { TodoContextMenu(todo: todo, lists: orderedLists, actions: actions, style: .wide) }
                    }
                }
                .padding(.vertical, Theme.Space.s1)
                .focusable()
                .focused($listFocused)
                .focusEffectDisabled()
                .onKeyPress(phases: .down) { press in listKey(press, shown) }
                if all.count > shown.count {
                    Text("+\(all.count - shown.count) more in Nylon")
                        .textStyle(Theme.Fonts.Role.meta)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.horizontal, Theme.Space.s4 + Theme.Phone.checkbox + Theme.Space.s3 + 4)
                        .padding(.bottom, Theme.Space.s2)
                }
            }
            if listFocused {
                Text("↵ open · X done · P pin · O link · ↑ or N to type")
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.horizontal, Theme.Space.s4)
                    .padding(.bottom, Theme.Space.s2)
                    .accessibilityHidden(true)
            }
            if presentation == .menuBar {
                Hairline()
                footer
            }
        }
        .overlay(alignment: .bottom) {
            ToastView(toasts: actions.toasts)
                .padding(.bottom, Theme.Space.s3)
        }
    }

    private func header(count: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s2) {
            Text(targetList?.name ?? "Today")
                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                .foregroundStyle(Theme.Colors.ink)
            if count > 0 {
                Text("\(count)")
                    .textStyle(Theme.Fonts.Role.meta)
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .accessibilityLabel(WideSidebar.countText(count))
            }
            Spacer()
            Button {
                MacServices.shared.showMainWindow()
                onDismiss()
            } label: {
                Label("Open Nylon", systemImage: "macwindow")
                    .labelStyle(.iconOnly)
                    .foregroundStyle(Theme.Colors.inkMuted)
            }
            .buttonStyle(.borderless)
            .pointingHandCursor()
            .help("Open Nylon")
        }
        .padding(.horizontal, Theme.Space.s4)
        .padding(.top, Theme.Space.s4)
        .padding(.bottom, Theme.Space.s1)
    }

    private var footer: some View {
        HStack {
            SettingsLink {
                Text("Settings…")
            }
            Spacer()
            Button("Quit Nylon") { NSApp.terminate(nil) }
                .keyboardShortcut("q")
        }
        .buttonStyle(.borderless)
        .textStyle(Theme.Fonts.Role.meta)
        .foregroundStyle(Theme.Colors.inkMuted)
        .padding(.horizontal, Theme.Space.s4)
        .padding(.vertical, Theme.Space.s2)
    }

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s3) {
            Text("Nylon")
                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                .foregroundStyle(Theme.Colors.ink)
            Text("Sign in to add todos from here.")
                .textStyle(Theme.Fonts.Role.bodyWide)
                .foregroundStyle(Theme.Colors.inkMuted)
            Button("Open Nylon") {
                MacServices.shared.showMainWindow()
                onDismiss()
            }
            if presentation == .menuBar {
                Hairline()
                footer.padding(.horizontal, -Theme.Space.s4)
            }
        }
        .padding(Theme.Space.s4)
    }

    // MARK: - Keyboard in the list

    /// The keyboard's row: by id, else whatever now sits in its slot.
    private func cursorRow(in shown: [TodoItem]) -> TodoItem? {
        guard !shown.isEmpty else { return nil }
        if let cursorId, let row = shown.first(where: { $0.id == cursorId }) { return row }
        return shown[min(cursorSlot, shown.count - 1)]
    }

    private func intoList(_ shown: [TodoItem]) {
        guard let first = shown.first else { return }
        cursorId = first.id
        cursorSlot = 0
        listFocused = true
    }

    private func backToField() {
        listFocused = false
        cursorId = nil
        cursorSlot = 0
        focusRequested = true
    }

    private func moveCursor(to index: Int, in shown: [TodoItem]) {
        let index = min(max(index, 0), shown.count - 1)
        cursorSlot = index
        cursorId = shown[index].id
    }

    private func listKey(_ press: KeyPress, _ shown: [TodoItem]) -> KeyPress.Result {
        guard let todo = cursorRow(in: shown), let at = shown.firstIndex(where: { $0.id == todo.id }) else {
            backToField()
            return .handled
        }
        switch press.key {
        case .downArrow:
            moveCursor(to: at + 1, in: shown)
            return .handled
        case .upArrow:
            if at == 0 { backToField() } else { moveCursor(to: at - 1, in: shown) }
            return .handled
        case .return:
            MacServices.shared.showMainWindow()
            onDismiss()
            return .handled
        case .escape:
            backToField()
            return .handled
        default:
            break
        }
        switch press.characters.lowercased() {
        case "j":
            moveCursor(to: at + 1, in: shown)
        case "k":
            if at == 0 { backToField() } else { moveCursor(to: at - 1, in: shown) }
        case "x":
            // Stay in the slot: the next todo moves up into it.
            cursorSlot = at
            cursorId = nil
            actions.toggleDone(todo)
        case "p":
            // Follow the todo to its new row.
            cursorId = todo.id
            actions.togglePin(todo)
        case "o":
            let first = todo.urls.sorted { $0.position < $1.position }.first?.url ?? todo.pendingUrls.first
            if let first, let url = URL(string: first) {
                openURL(url)
            } else {
                actions.toasts.show("No link on this todo", action: nil)
            }
        case "n":
            backToField()
        default:
            return .ignored
        }
        return .handled
    }

    private func add(_ listId: String?, _ parseDates: Bool) {
        let draft = text
        text = ""
        let created = actions.add(draft: draft, to: listId, parseDates: parseDates, userId: userId)
        guard !created.isEmpty else { return }
        let name = orderedLists.first { $0.id == (listId ?? todayList?.id) }?.name ?? "Today"
        actions.toasts.show(created.count > 1 ? "\(created.count) added to \(name)" : "Added to \(name)", action: nil)
    }
}
#endif
