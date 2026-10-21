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
            WideSidebar.Entry(list: $0, count: counts[$0.id.lowercased()] ?? 0)
        }
    }

    var sidebarCollections: [WideSidebar.Entry] {
        collections.map { WideSidebar.Entry(list: $0, count: counts[$0.id.lowercased()] ?? 0) }
    }

    var keyboardEnabled: Bool { boardFocused && editingColumnId == nil }

    // MARK: - Layout

    var wideBody: some View {
        HStack(spacing: 0) {
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
                onSignOut: signOut
            )
            VerticalHairline()
            board
                .inspector(isPresented: panelBinding) {
                    panel
                        .overlay(alignment: .leading) { VerticalHairline() }
                        .inspectorColumnWidth(min: 340, ideal: Theme.Wide.panelWidth, max: 520)
                }
        }
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .focusedSceneValue(\.board, BoardCommandHandler(keysEnabled: keyboardEnabled) { perform($0) })
    }

    var board: some View {
        GeometryReader { geometry in
            let columns = boardColumns
            let width = max(Theme.Wide.columnMinWidth, geometry.size.width / CGFloat(max(columns.count, 1)))
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
                SyncErrorLine(message: message) { Task { await syncService.sync() } }
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
                onDrop: { id, row in dropWide(id, on: row, into: list) }
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
                onDrop: { id, row in dropWide(id, on: row, into: list) }
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

    var panelBinding: Binding<Bool> {
        Binding(
            get: { detailTodo != nil || widePanel != nil },
            set: { if !$0 { closePanel() } }
        )
    }

    @ViewBuilder
    var panel: some View {
        if let todo = detailTodo {
            TodoDetailSheet(
                todo: todo,
                actions: actions,
                lists: orderedLists,
                apiService: syncService.apiService,
                userId: authService.userId,
                showsCalendar: showsDueCalendar,
                onClose: closePanel
            )
            .id("\(todo.id)-\(showsDueCalendar)")
        } else if let widePanel {
            PanelChrome(onClose: closePanel) {
                switch widePanel {
                case .done: DoneHistoryView(actions: actions, lists: orderedLists)
                case .settings: SettingsView()
                }
            }
        }
    }

    func showPanel(_ route: AccountRoute) {
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

/// A 1pt vertical rule between the sidebar and the columns.
struct VerticalHairline: View {
    var body: some View {
        Rectangle()
            .fill(Theme.Colors.hairline)
            .frame(width: 1)
            .frame(maxHeight: .infinity)
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }
}

/// Done and Settings in the trailing panel, with the detail's close button.
private struct PanelChrome<Content: View>: View {
    let onClose: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .overlay(alignment: .topTrailing) {
                Button(action: onClose) {
                    Image(systemName: Theme.Icon.close)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .frame(width: 30, height: 30)
                        .background(Theme.Colors.fill, in: Circle())
                        .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(.top, Theme.Space.s3)
                .padding(.trailing, Theme.Space.s3)
                .accessibilityLabel("Close")
            }
            .background(Theme.Colors.canvas)
    }
}
