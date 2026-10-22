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
//  The menu bar extra and the hotkey panel are the same view; the panel adds
//  Escape to close and drops the footer (Settings and Quit are already one
//  click away in the menu bar).
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
    }

    private var content: some View {
        let shown = Array(today.prefix(Self.rowLimit))
        return VStack(alignment: .leading, spacing: 0) {
            header(count: today.count)
            Composer(
                text: $text,
                lists: orderedLists,
                currentListId: todayList?.id,
                chosenListId: $chosenListId,
                focusRequested: $focusRequested,
                onSubmit: add,
                style: .inline
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
                            subtasks: subtasksByParent[todo.id] ?? [],
                            actions: actions,
                            lists: orderedLists
                        ) {
                            MacServices.shared.showMainWindow()
                            onDismiss()
                        }
                        .contextMenu { TodoContextMenu(todo: todo, lists: orderedLists, actions: actions, style: .wide) }
                    }
                }
                .padding(.vertical, Theme.Space.s1)
                if today.count > shown.count {
                    Text("+\(today.count - shown.count) more in Nylon")
                        .textStyle(Theme.Fonts.Role.meta)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.horizontal, Theme.Space.s4 + Theme.Phone.checkbox + Theme.Space.s3 + 4)
                        .padding(.bottom, Theme.Space.s2)
                }
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
            Text("Today")
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
