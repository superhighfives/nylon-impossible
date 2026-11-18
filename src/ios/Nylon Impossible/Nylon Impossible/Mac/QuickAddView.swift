//
//  QuickAddView.swift
//  Nylon Impossible
//
//  The Mac app: the popover the menu bar icon and the global hotkey open. A
//  helper, not a full app (the web board is the one full editor), so it stays
//  small: the composer — list chips, the "Due Fri ×" chip from
//  `TodoDateParser`, Return adds and keeps the field focused for the next one
//  — over today's count and the next few todos for today, each with its
//  checkbox. "Today" here is `TodayDigest`, the same set the widget shows.
//  There's no switcher and no lists; the composer's list chips are how a todo
//  goes somewhere else.
//
//  It works without the mouse. The field takes focus every time the popover
//  opens (the panel is reused, so `onAppear` only fires once). The list chips
//  show once you type; ⇥ and ⇧⇥ step through them. Return adds and stays;
//  Esc clears the field, then closes. ↓ goes into the list, where the
//  selected row has the board's fill and bar, and keys act on it
//  (`QuickAddRowCommand`): ↵ edits the title in place, ⇧↵ opens the todo on
//  the web, X marks it done (staying in the slot), O opens its link; ↑ from
//  the top row, Esc or N go back to the field. While you edit, ↵ saves and
//  Esc puts the old title back. Clicking a row's title edits it too.
//  Anything else about a todo happens on the web.
//

#if os(macOS)
import AppKit
import SwiftData
import SwiftUI

struct QuickAddView: View {
    var onDismiss: () -> Void = {}

    @Environment(\.modelContext) private var modelContext
    @Environment(\.screenRoute) private var screenRoute
    @Environment(\.openURL) var openURL
    @Environment(\.openSettings) private var openSettings
    @Environment(AuthService.self) private var authService
    @Environment(SyncService.self) private var syncService
    @Query(sort: \TodoItem.createdAt, order: .reverse) var todos: [TodoItem]
    @Query(sort: \TodoListModel.position) private var lists: [TodoListModel]

    @State var actions = TodoActions()
    @State private var text = ""
    @State private var chosenListId: String?
    @State var focusRequested = true
    /// The keyboard's row in the list, by id; `cursorSlot` keeps its place
    /// when a done todo leaves.
    @State var cursorId: UUID?
    @State var cursorSlot = 0
    /// The row whose title is being edited in place.
    @State var editing: QuickAddTitleEdit?
    @FocusState var listFocused: Bool
    @FocusState var editorFocused: Bool

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
        Self.todayRows(todos, lists: lists, userId: userId, hidden: actions.pendingDeletes)
    }

    /// The popover's rows: today's, whichever list the composer is adding to.
    static func todayRows(
        _ todos: [TodoItem],
        lists: [TodoListModel],
        userId: String?,
        hidden: Set<UUID> = [],
        now: Date = Date()
    ) -> [TodoItem] {
        let todayId = lists.first { $0.systemKind == .today }?.id
        return TodayDigest.select(todos, todayListId: todayId, userId: userId, now: now)
            .filter { !hidden.contains($0.id) }
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
        // Its list is driven by keys, so the selected row has the bar.
        .environment(\.selectsByKeyboard, true)
        .task {
            actions.configure(context: modelContext) { syncService.syncAfterAction() }
        }
        .onExitCommand(perform: onDismiss)
        // The panel is reused, so take the field every time it opens, and
        // pick up the list a `nylon://add` link names.
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { note in
            guard note.object is QuickAddPanel else { return }
            backToField()
            if let link = QuickActionService.shared.take() { follow(link) }
        }
    }

    private var content: some View {
        let all = today
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
                Text(EmptyCopy.today)
                    .textStyle(Theme.Fonts.Role.bodyWide)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.horizontal, Theme.Space.s4)
                    .padding(.vertical, Theme.Space.s4)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(shown) { todo in
                        let isEditing = editing?.id == todo.id
                        TodoRow(
                            todo: todo,
                            subtasks: subtasks[todo.id] ?? [],
                            actions: actions,
                            isSelected: isEditing || (listFocused && cursor?.id == todo.id),
                            lists: orderedLists,
                            onOpen: { beginEditing(todo, in: shown) },
                            titleField: isEditing ? AnyView(titleField(todo)) : nil
                        )
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
            if let hint = keysHint {
                Text(hint)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.horizontal, Theme.Space.s4)
                    .padding(.bottom, Theme.Space.s2)
                    .accessibilityHidden(true)
            }
            Hairline()
            footer
        }
        .overlay(alignment: .bottom) {
            ToastView(toasts: actions.toasts)
                .padding(.bottom, Theme.Space.s3)
        }
    }

    /// The keys that work where the keyboard is, under the list.
    private var keysHint: String? {
        if editing != nil { return "↵ save · Esc keep the old title" }
        if listFocused { return "↵ edit · ⇧↵ open on the web · X done · O link · ↑ or N to type" }
        return nil
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
                    .accessibilityLabel(MastheadCopy.todos(count))
            }
            Spacer()
        }
        .padding(.horizontal, Theme.Space.s4)
        .padding(.top, Theme.Space.s4)
        .padding(.bottom, Theme.Space.s1)
    }

    private var footer: some View {
        HStack {
            Button("Settings…") {
                MacServices.shared.showSettings { openSettings() }
                onDismiss()
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
            Button("Sign in") {
                MacServices.shared.showSignIn()
                onDismiss()
            }
            Hairline()
            footer.padding(.horizontal, -Theme.Space.s4)
        }
        .padding(Theme.Space.s4)
    }

    /// A `nylon://add` link (the widget's "+", a Shortcut): add to its list.
    private func follow(_ link: DeepLink) {
        switch link {
        case .add(let target):
            let id: String?
            if let kind = target.systemKind {
                id = orderedLists.first { $0.systemKind == kind }?.id
            } else if case .list(let listId) = target {
                id = orderedLists.first { $0.id == listId }?.id
            } else {
                id = nil
            }
            chosenListId = id == todayList?.id ? nil : id
        }
    }

    private func add(_ listId: String?, _ parseDates: Bool) {
        let draft = text
        text = ""
        let created = actions.add(draft: draft, to: listId, parseDates: parseDates, userId: userId)
        guard !created.isEmpty else { return }
        let name = orderedLists.first { $0.id == (listId ?? todayList?.id) }?.nameInSentence
            ?? SystemListKind.today.nameInSentence
        // No "View": the popover shows only Today, so it would have to open a
        // browser (PRINCIPLES.md, principle 5's exception).
        actions.toasts.show(ToastCopy.added(count: created.count, listName: name), action: nil)
    }
}
#endif
