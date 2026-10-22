//
//  ContentView+Wide.swift
//  Nylon Impossible
//
//  The iPad board: the sidebar, then Today, This Week and Someday as hairline
//  columns that are always there, plus one of your lists as a fourth column
//  when it's picked in the sidebar. The detail, Done and Settings open in a
//  trailing panel (an inspector) instead of a sheet.
//
//  It shares ContentView's state and TodoActions with the phone layout, so a
//  window resized between the two keeps what's open; see `carryAcross`.
//

import SwiftUI

extension ContentView {
    // MARK: - Derived

    /// The board's columns, left to right.
    var boardColumns: [TodoListModel] {
        var columns = [Page.today, .thisWeek, .someday].compactMap(timeList)
        if let id = openColumnId, let list = collections.first(where: { $0.id == id }) {
            columns.append(list)
        }
        return columns
    }

    var focusedColumn: TodoListModel? {
        boardColumns.first { $0.id == focusedColumnId } ?? boardColumns.first
    }

    var sidebarTimeLists: [WideSidebar.Entry] {
        [Page.today, .thisWeek, .someday].compactMap(timeList).map {
            WideSidebar.Entry(list: $0, openTodos: counts[$0.id.lowercased()] ?? 0)
        }
    }

    var sidebarCollections: [WideSidebar.Entry] {
        collections.map { WideSidebar.Entry(list: $0, openTodos: counts[$0.id.lowercased()] ?? 0) }
    }

    var keyboardEnabled: Bool { boardFocused && editingColumnId == nil }

    // MARK: - Layout

    var wideBody: some View {
        #if os(macOS)
        // A Mac window: the sidebar in a split view (so it has the system's
        // toggle, ⌃⌘S and a resizable divider), the focused list as the
        // window title, and a toolbar.
        NavigationSplitView(columnVisibility: $sidebarVisibility) {
            sidebar
                .navigationSplitViewColumnWidth(min: 200, ideal: Theme.Wide.sidebarWidth, max: 320)
        } detail: {
            boardWithPanel
        }
        .navigationTitle(focusedColumn?.name ?? "Nylon")
        .navigationSubtitle(windowSubtitle)
        .toolbar { macToolbar }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .focusedSceneValue(\.board, commandHandler)
        .onChange(of: actions.toasts.current) { undoBridge.sync(actions.toasts, undoManager: undoManager) }
        #else
        HStack(spacing: 0) {
            sidebar
            VerticalHairline()
            boardWithPanel
        }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .focusedSceneValue(\.board, commandHandler)
        #endif
    }

    var sidebar: some View {
        WideSidebar(
            timeLists: sidebarTimeLists,
            collections: sidebarCollections,
            openColumnId: openColumnId,
            panel: detailTodo == nil ? widePanel : nil,
            doneCount: doneCount,
            name: displayName,
            initials: initials,
            avatarURL: screenRoute == nil ? authService.userImageURL : nil,
            onTimeList: { focusColumn($0.id) },
            onCollection: toggleColumn,
            onNewList: {
                newListName = ""
                showsNewList = true
            },
            onPanel: showPanel,
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
        GeometryReader { geometry in
            let columns = boardColumns
            // At accessibility text sizes the columns keep a readable width
            // and the board scrolls sideways, rather than squeezing three
            // columns until words break mid-letter.
            let minimum = dynamicTypeSize.isAccessibilitySize ? Theme.Wide.columnMinWidthLargeText : Theme.Wide.columnMinWidth
            let width = max(minimum, geometry.size.width / CGFloat(max(columns.count, 1)))
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    HStack(spacing: 0) {
                        ForEach(Array(columns.enumerated()), id: \.element.id) { index, list in
                            HStack(spacing: 0) {
                                if index > 0 { VerticalHairline() }
                                column(list)
                            }
                            .frame(width: width, height: geometry.size.height)
                            .id(list.id)
                            .transition(.opacity.combined(with: .move(edge: .trailing)))
                        }
                    }
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
        }
        .environment(\.isWideLayout, true)
        .animation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base), value: openColumnId)
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
            guard editingColumnId == nil,
                  let key = BoardKey.from(key: press.key, characters: press.characters, modifiers: press.modifiers)
            else { return .ignored }
            perform(key)
            return .handled
        }
        .refreshable { await syncService.sync() }
    }

    @ViewBuilder
    func column(_ list: TodoListModel) -> some View {
        let rows = rows(list)
        let composer = columnComposer(list)
        if let kind = list.systemKind {
            BoardColumn(
                list: list,
                title: list.name,
                subline: MastheadCopy.columnSubline(kind),
                rows: rows,
                subtasks: subtasksByParent,
                lists: orderedLists,
                actions: actions,
                selectedId: selectedTodoId,
                overnight: kind == .today ? overnightText.map { ($0, dismissOvernight) } : nil,
                empty: wideEmpty(kind),
                composer: composer,
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
                subtasks: subtasksByParent,
                lists: orderedLists,
                actions: actions,
                selectedId: selectedTodoId,
                isTinted: true,
                overnight: nil,
                empty: ("Nothing here yet.", nil),
                composer: composer,
                onOpen: openWide,
                onDrop: { id, row in dropWide(id, on: row, into: list) },
                onExternalDrop: { addDropped($0, to: list) }
            ) {
                collectionMenu(list)
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
            }
        )
    }

    func collectionMenu(_ list: TodoListModel) -> some View {
        Menu {
            Button {
                renameText = list.name
                renamingList = list
            } label: {
                Label("Rename", systemImage: Theme.Icon.edit)
            }
            Button {
                toggleColumn(list)
            } label: {
                Label("Close column", systemImage: Theme.Icon.close)
            }
            Divider()
            Button(role: .destructive) {
                deletingList = list
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
        .accessibilityLabel("List options")
    }

    func wideEmpty(_ kind: SystemListKind) -> (text: String, link: (text: String, action: () -> Void)?) {
        switch kind {
        case .today:
            let waiting = count(.thisWeek)
            let link = timeList(.thisWeek).map { list in ("\(waiting) waiting in This Week", { focusColumn(list.id) }) }
            return ("Nothing today.", waiting > 0 ? link : nil)
        case .thisWeek:
            let waiting = count(.someday)
            let link = timeList(.someday).map { list in ("\(waiting) waiting in Someday", { focusColumn(list.id) }) }
            return ("A clear week.", waiting > 0 ? link : nil)
        case .someday:
            return ("Nothing here yet.", nil)
        }
    }

    // MARK: - Panel

    func showPanel(_ route: AccountRoute) {
        #if os(macOS)
        // A Mac has a Settings window (⌘,); the sidebar's Settings opens it.
        if route == .settings, screenRoute == nil {
            openSettings()
            return
        }
        #endif
        detailTodo = nil
        widePanel = widePanel == route ? nil : route
    }

    func closePanel() {
        detailTodo = nil
        widePanel = nil
        showsDueCalendar = false
        boardFocused = true
    }

    // MARK: - Actions

    func openWide(_ todo: TodoItem) {
        selectedTodoId = todo.id
        if let column = boardColumns.first(where: { $0.id.lowercased() == todo.listKey?.lowercased() }) {
            focusedColumnId = column.id
        }
        showsDueCalendar = false
        widePanel = nil
        detailTodo = todo
    }

    /// A time list in the sidebar: scroll to its column and give it the
    /// keyboard. Nothing opens.
    func focusColumn(_ id: String) {
        if focusedColumnId != id { selectedTodoId = nil }
        focusedColumnId = id
        scrollColumnId = id
        boardFocused = true
    }

    /// One of your lists: open it as the fourth column, swap it for another,
    /// or close it when it's the one already open.
    func toggleColumn(_ list: TodoListModel) {
        if openColumnId == list.id {
            openColumnId = nil
            if focusedColumnId == list.id { focusedColumnId = timeList(.today)?.id }
        } else {
            openColumnId = list.id
            focusColumn(list.id)
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
        if !list.isSystem { openColumnId = list.id }
        focusColumn(list.id)
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

    func commitNewList() {
        let name = newListName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        Task {
            if await createList(name), let id = viewModel.openCollectionId {
                openColumnId = id
                focusColumn(id)
            }
        }
    }
}
