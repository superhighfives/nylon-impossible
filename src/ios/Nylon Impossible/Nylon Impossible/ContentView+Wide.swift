//
//  ContentView+Wide.swift
//  Nylon Impossible
//
//  The board (iPad and Mac): the sidebar, a toolbar, then four columns that
//  never change width: Today, This week, Someday, and a fourth that shows
//  the open todo's detail, else the list picked in the sidebar, else Done.
//  One click selects a row; a click on the selection (or Return) opens it in
//  the fourth column, and while a todo is open the detail follows the
//  selection. Settings is a sheet on iPad and its own window on a Mac.
//
//  It shares ContentView's state and TodoActions with the phone layout, so a
//  window resized between the two keeps what's open; see `carryAcross`.
//

import SwiftUI

/// Which button the New list popover is anchored to.
enum NewListAnchor: Hashable {
    case sidebar, toolbar
}

/// What every board column reads from the whole store, worked out once per
/// update of the board.
struct BoardDerived {
    let counts: [String: Int]
    let subtasks: [UUID: [TodoItem]]
    let lists: [TodoListModel]
}

extension ContentView {
    // MARK: - Derived

    /// The three time lists, always the first three columns.
    var timeColumns: [TodoListModel] {
        [Page.today, .thisWeek, .someday].compactMap(timeList)
    }

    /// Your list open in the fourth column, if it still exists.
    var openList: TodoListModel? {
        openColumnId.flatMap { id in collections.first { $0.id == id } }
    }

    /// The columns with rows, left to right: the time lists, and your list
    /// when the fourth column shows it (not under an open todo, not Done).
    var boardColumns: [TodoListModel] {
        var columns = timeColumns
        if detailTodo == nil, let list = openList { columns.append(list) }
        return columns
    }

    /// The fourth column shows Done: nothing's open and no list is picked.
    var doneShowing: Bool { detailTodo == nil && openList == nil }

    /// The column the selection is in: a list's id, `done`, or nil.
    var selectionColumn: String? {
        guard let id = selectedTodoId, let todo = todos.first(where: { $0.id == id }) else { return nil }
        if todo.isCompleted { return Self.doneColumn }
        return orderedLists.first { $0.id.lowercased() == todo.listKey?.lowercased() }?.id
    }

    /// The selection's column key when it's in Done.
    static let doneColumn = "done"

    var focusedColumn: TodoListModel? {
        boardColumns.first { $0.id == focusedColumnId } ?? boardColumns.first
    }

    func sidebarTimeLists(counts: [String: Int]) -> [WideSidebar.Entry] {
        [Page.today, .thisWeek, .someday].compactMap(timeList).map {
            WideSidebar.Entry(list: $0, openTodos: counts[$0.id.lowercased()] ?? 0)
        }
    }

    func sidebarCollections(counts: [String: Int]) -> [WideSidebar.Entry] {
        collections.map { WideSidebar.Entry(list: $0, openTodos: counts[$0.id.lowercased()] ?? 0) }
    }

    /// The board's smallest height in a Mac window: a masthead and a few rows.
    static let boardMinHeight: CGFloat = 320

    var keyboardEnabled: Bool { boardFocused && editingColumnId == nil }

    // MARK: - Layout

    var wideBody: some View {
        #if os(macOS)
        // A Mac window: the sidebar in a split view (so it has the system's
        // toggle, ⌃⌘S and a resizable divider), the focused list as the
        // window title, and a toolbar.
        boardOverlays(NavigationSplitView(columnVisibility: $sidebarVisibility) {
            sidebar
                // The sidebar shares the board's canvas, so the split view's
                // own divider doesn't show; draw the iPad's hairline instead.
                .overlay(alignment: .trailing) { VerticalHairline() }
                .navigationSplitViewColumnWidth(min: 200, ideal: Theme.Wide.sidebarWidth, max: 320)
        } detail: {
            boardWithDetail
                // A fixed minimum, so the split view never asks the board's
                // content for one. Left to SwiftUI, the detail's minimum size
                // came from the columns and rows; collapsing or showing the
                // sidebar resized the board, which moved that minimum, which
                // re-ran the split view's layout. macOS 27 settles; on macOS 26
                // it looped until AppKit threw ("more Update Constraints in
                // Window passes than there are views in the window").
                .frame(
                    minWidth: Theme.Wide.columnMinWidth, maxWidth: .infinity,
                    minHeight: Self.boardMinHeight, maxHeight: .infinity
                )
        })
        .navigationTitle(focusedColumn?.name ?? "Nylon")
        .navigationSubtitle(windowSubtitle)
        .toolbar { macToolbar }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .focusedSceneValue(\.board, commandHandler)
        .onChange(of: actions.toasts.current) { undoBridge.sync(actions.toasts, undoManager: undoManager) }
        #else
        boardOverlays(HStack(spacing: 0) {
            sidebar
            VerticalHairline()
            VStack(spacing: 0) {
                boardToolbar
                Hairline()
                boardWithDetail
            }
        })
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .focusedSceneValue(\.board, commandHandler)
        .sheet(isPresented: Binding(get: { widePanel == .settings }, set: { if !$0 { widePanel = nil } })) {
            PanelChrome(onClose: { widePanel = nil }) { SettingsView() }
                .presentationBackground(Theme.Colors.canvas)
        }
        #endif
    }

    var sidebar: some View {
        let counts = counts
        return WideSidebar(
            timeLists: sidebarTimeLists(counts: counts),
            collections: sidebarCollections(counts: counts),
            openColumnId: detailTodo == nil ? openList?.id : nil,
            selectionColumn: selectionColumn,
            doneShowing: doneShowing,
            doneCount: doneCount,
            name: displayName,
            initials: initials,
            avatarURL: screenRoute == nil ? authService.userImageURL : nil,
            onTimeList: { focusColumn($0.id) },
            onCollection: openCollection,
            newListAnchor: $newListAnchor,
            onCreateList: commitNewList,
            onDone: showDone,
            onSettings: { showPanel(.settings) },
            onShortcuts: { showsShortcuts = true },
            cursor: sidebarCursor,
            onDrop: { list, id in
                guard let todo = todos.first(where: { $0.id == id }) else { return }
                actions.move(todo, toList: list.id)
            },
            onSignOut: signOut,
            onFeedback: showsFeedback ? {
                #if os(macOS)
                // The menu is its own window, so the board is unobstructed.
                feedback?.presentWithSnapshot()
                #else
                feedback?.present()
                #endif
            } : nil
        )
    }

    var board: some View {
        let columns = timeColumns
        // Every column reads these; work them out once per update rather than
        // once per column (each is a pass over every todo in the store).
        let derived = BoardDerived(counts: counts, subtasks: subtasksByParent, lists: orderedLists)
        // At accessibility text sizes the columns keep a readable width
        // and the board scrolls sideways, rather than squeezing four
        // columns until words break mid-letter.
        let minimum = dynamicTypeSize.isAccessibilitySize ? Theme.Wide.columnMinWidthLargeText : Theme.Wide.columnMinWidth
        return ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: 0) {
                    ForEach(Array(columns.enumerated()), id: \.element.id) { index, list in
                        HStack(spacing: 0) {
                            if index > 0 { VerticalHairline() }
                            column(list, derived: derived)
                        }
                        // Sized in layout, not in body: resizing the window or
                        // collapsing the sidebar animates the width every
                        // frame, and a GeometryReader here rebuilt every
                        // column (and rescanned the store) on each of them.
                        // Width only: a horizontal scroll view takes its
                        // height from its content, so sizing the height from
                        // the container too is a cycle, and inside the Mac's
                        // split view it never settles (AppKit throws after
                        // too many constraint passes, at launch). Always a
                        // quarter, so the columns never change width.
                        .containerRelativeFrame(.horizontal) { length, _ in
                            max(minimum, length / 4)
                        }
                        .frame(maxHeight: .infinity)
                        .id(list.id)
                    }
                    HStack(spacing: 0) {
                        VerticalHairline()
                        fourthColumn(derived: derived)
                    }
                    .containerRelativeFrame(.horizontal) { length, _ in
                        max(minimum, length / 4)
                    }
                    .frame(maxHeight: .infinity)
                    .id(openList?.id ?? Self.doneColumn)
                }
                .sharesBoardHeaderHeight()
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .onChange(of: scrollColumnId) { _, id in
                guard let id else { return }
                withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.slow)) {
                    proxy.scrollTo(id)
                }
                scrollColumnId = nil
            }
        }
        .environment(\.isWideLayout, true)
        .overlay(alignment: .top) {
            if case .error(let message) = syncService.state {
                SyncErrorLine(
                    message: message,
                    gutter: Theme.Wide.gutter,
                    onRetry: { Task { await syncService.sync() } },
                    onDismiss: syncService.dismissError
                )
                .background(Theme.Colors.canvas)
                .transition(.opacity)
            }
        }
        .overlay(alignment: .bottom) {
            ToastView(toasts: actions.toasts)
                .padding(.bottom, Theme.Space.s6)
        }
        .focusable()
        .focused($boardFocused)
        .focusEffectDisabled()
        .onKeyPress(phases: .down) { press in
            guard editingColumnId == nil, renamingColumnId == nil, palette == nil else { return .ignored }
            if let key = takeGo(press.characters) {
                perform(key)
                return .handled
            }
            guard let key = BoardKey.from(key: press.key, characters: press.characters, modifiers: press.modifiers)
            else { return .ignored }
            perform(key)
            return .handled
        }
        .refreshable { await syncService.sync() }
    }

    /// The fourth column: the open todo's detail, else your list, else Done.
    @ViewBuilder
    func fourthColumn(derived: BoardDerived) -> some View {
        if let todo = detailTodo {
            WidePanel(
                todo: todo,
                route: nil,
                lists: derived.lists,
                actions: actions,
                apiService: syncService.apiService,
                userId: authService.userId,
                showsCalendar: showsDueCalendar,
                onClose: closeDetail
            )
            .background(Theme.Colors.surface)
            // Esc closes the open todo even while its fields have focus.
            .onKeyPress(.escape) {
                closeDetail()
                return .handled
            }
        } else if let list = openList {
            column(list, derived: derived)
        } else {
            BoardDoneColumn(
                todos: doneTodos,
                lists: derived.lists,
                selectedId: selectedTodoId,
                onSelect: selectWide,
                onRestore: { actions.restoreFromDone($0) }
            )
        }
    }

    @ViewBuilder
    func column(_ list: TodoListModel, derived: BoardDerived) -> some View {
        let rows = rows(list)
        let composer = columnComposer(list)
        if let kind = list.systemKind {
            BoardColumn(
                list: list,
                title: list.name,
                subline: MastheadCopy.columnSubline(kind),
                rows: rows,
                subtasks: derived.subtasks,
                lists: derived.lists,
                actions: actions,
                selectedId: selectedTodoId,
                overnight: kind == .today ? overnightText.map { ($0, seeOvernight, dismissOvernight) } : nil,
                empty: wideEmpty(kind, counts: derived.counts),
                composer: composer,
                onSelect: selectWide,
                onOpen: openWide,
                onDrop: { id, row in dropWide(id, on: row, into: list) },
                onExternalDrop: { addDropped($0, to: list) }
            )
        } else {
            BoardColumn(
                list: list,
                title: list.name,
                subline: MastheadCopy.columnSubline(nil),
                rows: rows,
                subtasks: derived.subtasks,
                lists: derived.lists,
                actions: actions,
                selectedId: selectedTodoId,
                isTinted: true,
                overnight: nil,
                empty: ("Nothing here yet.", nil),
                composer: composer,
                onSelect: selectWide,
                onOpen: openWide,
                onRename: { rename(list, to: $0) },
                isRenaming: Binding(
                    get: { renamingColumnId == list.id },
                    set: { renamingColumnId = $0 ? list.id : nil }
                ),
                onDrop: { id, row in dropWide(id, on: row, into: list) },
                onExternalDrop: { addDropped($0, to: list) }
            ) {
                collectionMenu(list)
                Button(action: showDone) {
                    Image(systemName: Theme.Icon.close)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close \(list.name)")
                .help("Close \(list.name)")
            }
        }
    }

    func columnComposer(_ list: TodoListModel) -> Composer {
        let id = list.id
        return Composer(
            text: Binding(get: { drafts[id] ?? "" }, set: { drafts[id] = $0 }),
            lists: orderedLists,
            currentListId: id,
            chosenListId: Binding(get: { chosenTargets[id] }, set: { chosenTargets[id] = $0 }),
            focusRequested: Binding(
                get: { composerFocusRequest == id },
                set: { if !$0, composerFocusRequest == id { composerFocusRequest = nil } }
            ),
            onSubmit: { target, parseDates in addWide(from: id, to: target, parseDates: parseDates) },
            style: .inline,
            onFocusChange: { focused in
                if focused {
                    editingColumnId = id
                    focusedColumnId = id
                } else if editingColumnId == id {
                    editingColumnId = nil
                    boardFocused = true
                }
            },
            showsListChips: false
        )
    }

    func collectionMenu(_ list: TodoListModel) -> some View {
        Menu {
            Button {
                renamingColumnId = list.id
            } label: {
                Label("Rename", systemImage: Theme.Icon.edit)
            }
            Divider()
            Button(role: .destructive) {
                deleteListWithUndo(list)
            } label: {
                Label("Delete list", systemImage: Theme.Icon.delete)
            }
        } label: {
            Image(systemName: Theme.Icon.more)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Colors.inkMuted)
                .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("\(list.name) options")
    }

    func wideEmpty(_ kind: SystemListKind, counts: [String: Int]) -> (text: String, link: (text: String, action: () -> Void)?) {
        func count(_ page: Page) -> Int { timeList(page).map { counts[$0.id.lowercased()] ?? 0 } ?? 0 }
        switch kind {
        case .today:
            let waiting = count(.thisWeek)
            let link = timeList(.thisWeek).map { list in ("\(waiting) waiting in This week", { focusColumn(list.id) }) }
            return ("Nothing today.", waiting > 0 ? link : nil)
        case .thisWeek:
            let waiting = count(.someday)
            let link = timeList(.someday).map { list in ("\(waiting) waiting in Someday", { focusColumn(list.id) }) }
            return ("A clear week.", waiting > 0 ? link : nil)
        case .someday:
            return ("Nothing here yet.", nil)
        }
    }

    func requestComposer(_ columnId: String) {
        focusedColumnId = columnId
        scrollColumnId = columnId
        composerFocusRequest = columnId
    }

    func addWide(from columnId: String, to listId: String?, parseDates: Bool) {
        let text = drafts[columnId] ?? ""
        drafts[columnId] = ""
        let created = actions.add(draft: text, to: listId, parseDates: parseDates, userId: authService.userId)
        noteAdded(created, to: listId)
        guard !created.isEmpty, let listId, listId != columnId else { return }
        let name = orderedLists.first { $0.id == listId }?.name ?? "List"
        let message = created.count > 1 ? "\(created.count) added to \(name)" : "Added to \(name)"
        actions.toasts.show(message, actionLabel: "View") {
            showColumn(listId)
        }
    }

    func showColumn(_ listId: String) {
        guard let list = orderedLists.first(where: { $0.id.lowercased() == listId.lowercased() }) else { return }
        if list.isSystem {
            focusColumn(list.id)
        } else {
            openCollection(list)
        }
    }

    /// A drop on a column moves the todo there; a drop on a row also places
    /// it just above that row, which is how a column reorders.
    func dropWide(_ id: UUID, on row: TodoItem?, into list: TodoListModel) {
        guard let todo = todos.first(where: { $0.id == id }) else { return }
        if todo.listKey?.lowercased() != list.id.lowercased() {
            actions.move(todo, toList: list.id)
        }
        guard let row, row.id != id else { return }
        let current = rows(list)
        guard let from = current.firstIndex(where: { $0.id == id }),
              let to = current.firstIndex(where: { $0.id == row.id }) else { return }
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            actions.viewModel.moveTodo(from: IndexSet(integer: from), to: to, in: current)
        }
        actions.edited()
    }

    /// New list: create it, open it in the fourth column, and put the
    /// cursor in its Add field.
    func commitNewList(_ name: String) {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        Task {
            if await createList(name), let id = viewModel.openCollectionId,
               let list = collections.first(where: { $0.id == id }) {
                openCollection(list)
                requestComposer(id)
            }
        }
    }
}
