//
//  ContentView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(AuthService.self) private var authService
    @Environment(SyncService.self) private var syncService
    @Environment(UserPreferencesService.self) private var preferencesService
    @Query(sort: \TodoItem.createdAt, order: .reverse) private var todos: [TodoItem]
    @Query(sort: \TodoListModel.position) private var lists: [TodoListModel]
    @State private var viewModel = TodoViewModel()
    // Bumped at each local midnight so repeats completed "today" derive back to
    // active (isEffectivelyCompleted flips) without a refetch. Any @State write
    // re-runs body, which recomputes the sorted/filtered lists.
    @State private var midnightTick = 0
    // The incomplete row a drag is currently hovering over. Drives the thin
    // "drop here" line — the iOS analogue of web's yellow reorder line.
    @State private var dropTargetId: UUID?
    // Staged by swipe-to-delete; the row only actually deletes once confirmed.
    @State private var pendingDeleteTodo: TodoItem?

    /// Lists in the fixed order: Today, This Week, Sometime, then custom
    /// lists by position. Mirrors web's `TodoGrid` ordering.
    private var orderedLists: [TodoListModel] {
        lists.sorted { a, b in
            if a.isSystem != b.isSystem { return a.isSystem }
            if a.isSystem && b.isSystem { return a.systemSortIndex < b.systemSortIndex }
            return a.position < b.position
        }
    }

    /// Subtasks live inside their parent's edit sheet, not as their own rows,
    /// so a list's page is top-level todos only, scoped to that list. List
    /// scoping itself lives in `TodoViewModel.sortedTodos` — this only needs
    /// to strip out subtasks first.
    private func sortedTodosList(for listId: String?) -> [TodoItem] {
        let topLevel = todos.filter { $0.parentId == nil }
        return viewModel.sortedTodos(from: topLevel, listId: listId)
    }

    /// A todo's subtasks (active + completed), excluding soft-deleted.
    private func subtasks(of todo: TodoItem) -> [TodoItem] {
        todos.filter { $0.parentId == todo.id && !$0.isDeleted }
    }

    /// Sleeps until just past the next local midnight, bumps `midnightTick`, and
    /// repeats — so a completed repeat drops out of Completed on time.
    private func scheduleMidnightTicks() async {
        while !Task.isCancelled {
            let now = Date()
            guard let nextMidnight = Calendar.current.nextDate(
                after: now,
                matching: DateComponents(hour: 0, minute: 0, second: 0),
                matchingPolicy: .nextTime
            ) else { return }
            let seconds = nextMidnight.timeIntervalSince(now) + 1
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            if Task.isCancelled { return }
            midnightTick += 1
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            GradientBackground()

            // Paged-swipe across lists — Today, This Week, Sometime, then
            // custom lists in order. Each page fills the screen and scrolls
            // *behind* the floating header and input bar (liquid glass), so
            // nothing sits in an opaque box. No grid view in v1.
            TabView(selection: Bindable(viewModel).selectedListId) {
                ForEach(orderedLists) { list in
                    Group {
                        let pageTodos = sortedTodosList(for: list.id)
                        if pageTodos.isEmpty {
                            ScrollView {
                                EmptyStateView()
                                    .transition(.opacity)
                                    .frame(maxWidth: .infinity)
                                    .padding(.top, 96)
                                    .padding(.bottom, 100)
                            }
                        } else {
                            taskListView(for: pageTodos)
                        }
                    }
                    .tag(Optional(list.id))
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .padding(.horizontal, 16)
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .onAppear {
                viewModel.selectDefaultListIfNeeded(from: orderedLists)
            }
            .onChange(of: orderedLists.map(\.id)) {
                viewModel.selectDefaultListIfNeeded(from: orderedLists)
            }

            // Floating header — pinned to the top, overlapping the scrolling
            // list beneath it. Its glass pill is the only opaque element; the
            // list shows through around it so it reads as floating, not boxed.
            VStack(spacing: 0) {
                HeaderView(
                    onSignOut: {
                        Task { await authService.signOut() }
                    },
                    syncState: syncService.state
                )

                // Sync failures surface here in the main view (with retry)
                // rather than tucked behind the avatar menu. Transient
                // connectivity blips never reach `.error` — see SyncService.
                if case .error(let message) = syncService.state {
                    SyncErrorBanner(message: message) {
                        Task { await syncService.sync() }
                    }
                    .padding(.top, 12)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                Spacer(minLength: 0)
            }
            .animation(.easeInOut(duration: 0.25), value: syncService.state)
            .padding(.horizontal, 16)
            .ignoresSafeArea(.keyboard, edges: .bottom)

            // Floating input bar — liquid glass, anchored to the bottom and
            // rising with the keyboard (like Discord) since it does not ignore
            // the keyboard safe area.
            AddTaskInputView(
                text: $viewModel.newTaskText,
                canAdd: viewModel.canAddTask,
                aiAvailable: preferencesService.aiEnabled
            ) { option in
                let text = viewModel.newTaskText
                viewModel.newTaskText = ""

                // Create instantly and locally so the todo appears and persists
                // even with no connection; sync (and any requested AI) run in
                // the background. Enrich/research is recorded on the todo and
                // fired once it has synced (SyncService.processPendingAI), so
                // choosing it offline still takes effect on reconnect.
                guard let todo = TaskCreationService.createSmart(
                    text: text,
                    userId: authService.userId,
                    context: modelContext,
                    allTodos: todos,
                    listId: viewModel.selectedListId.flatMap { UUID(uuidString: $0) }
                ) else { return }

                if preferencesService.aiEnabled {
                    switch option {
                    case .enrich:
                        // Show the AI spinner immediately; the server flips this
                        // through processing → complete once enrichment runs.
                        // aiStartedAt is re-stamped when the enrich call actually
                        // fires (processPendingAI), so the spinner stays honest
                        // even if syncing is delayed while offline.
                        todo.aiStatus = TodoAIStatus.pending.rawValue
                        todo.aiStartedAt = Date()
                        todo.pendingEnrich = true
                    case .research:
                        todo.pendingResearch = true
                    case .plain:
                        break
                    }
                    try? modelContext.save()
                }

                syncService.syncAfterAction()
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 6)
        }
        .animation(.easeInOut(duration: 0.3), value: todos.count)
        .refreshable {
            await syncService.sync()
        }
        .task {
            await scheduleMidnightTicks()
        }
        .confirmationDialog(
            "Delete this todo?",
            isPresented: Binding(
                get: { pendingDeleteTodo != nil },
                set: { if !$0 { pendingDeleteTodo = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) { confirmPendingDelete() }
            Button("Cancel", role: .cancel) { pendingDeleteTodo = nil }
        } message: {
            Text("This can't be undone.")
        }
    }

    private func taskListView(for pageTodos: [TodoItem]) -> some View {
        let incomplete = pageTodos.filter { !$0.isEffectivelyCompleted }
        let completed = pageTodos.filter { $0.isEffectivelyCompleted }

        return List {
            Section {
                // Reordering is driven by `.draggable`/`.dropDestination` rather
                // than `.onMove`. `.onMove`'s lift is a system-managed opaque
                // platter that can't be restyled; owning the drag lets the
                // lifted row render as Liquid Glass (see `dragPreview`), matching
                // web's translucent, blurred, ringed drag card.
                ForEach(Array(incomplete.enumerated()), id: \.element.id) { index, todo in
                    todoRow(todo)
                        // Thin brand line on the hovered row's leading edge — the
                        // "it'll land here" cue, mirroring web's drop line.
                        .overlay(alignment: .top) {
                            if dropTargetId == todo.id {
                                Capsule()
                                    .fill(Color.appBrand)
                                    .frame(height: 2)
                                    .padding(.horizontal, 4)
                                    .transition(.opacity)
                            }
                        }
                        .draggable(todo.id.uuidString) {
                            dragPreview(for: todo)
                        }
                        .dropDestination(for: String.self) { items, _ in
                            handleReorderDrop(items, ontoIndex: index, in: incomplete)
                        } isTargeted: { targeted in
                            withAnimation(.easeInOut(duration: 0.15)) {
                                if targeted {
                                    dropTargetId = todo.id
                                } else if dropTargetId == todo.id {
                                    dropTargetId = nil
                                }
                            }
                        }
                }
            }

            // Completed items collapse into a bottom-of-list accordion, matching
            // web: the toggle (with a count badge) always shows when there are
            // completed items; `hideCompleted` controls collapsed vs expanded
            // rather than hiding the section outright.
            if !completed.isEmpty {
                Section {
                    completedAccordionHeader(count: completed.count)

                    if !preferencesService.hideCompleted {
                        ForEach(completed) { todo in
                            todoRow(todo)
                                .moveDisabled(true)
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        // Top inset so the first row starts below the floating header (rows
        // still scroll up behind it), bottom inset so content clears the
        // floating input bar.
        .contentMargins(.top, 72, for: .scrollContent)
        .contentMargins(.bottom, 100, for: .scrollContent)
    }

    @ViewBuilder
    private func completedAccordionHeader(count: Int) -> some View {
        Button {
            // Capture the intended value synchronously so a concurrent sync
            // flipping `hideCompleted` between tap and task can't invert it.
            let newValue = !preferencesService.hideCompleted
            Task {
                await preferencesService.setHideCompleted(newValue)
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .rotationEffect(.degrees(preferencesService.hideCompleted ? 0 : 90))
                    .animation(.easeInOut(duration: 0.2), value: preferencesService.hideCompleted)

                Text("Completed")
                    .font(.system(size: 13, weight: .medium))

                Text("\(count)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.appTint, in: RoundedRectangle(cornerRadius: 6))

                Spacer()
            }
            .foregroundStyle(Color.appSubtle)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Expose expanded/collapsed state to VoiceOver, mirroring the web
        // toggle's aria-expanded.
        .accessibilityLabel("Completed, \(count) \(count == 1 ? "item" : "items")")
        .accessibilityValue(preferencesService.hideCompleted ? "Collapsed" : "Expanded")
        .accessibilityHint(preferencesService.hideCompleted ? "Double tap to expand" : "Double tap to collapse")
        .textCase(nil)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 16, leading: 4, bottom: 4, trailing: 0))
        .moveDisabled(true)
    }

    @ViewBuilder
    private func todoRow(_ todo: TodoItem) -> some View {
        TodoItemRow(
            todo: todo,
            apiService: syncService.apiService,
            urls: todo.urls.map { APITodoUrl(from: $0, todoId: todo.id.uuidString.lowercased()) },
            subtasks: subtasks(of: todo),
            availableLists: orderedLists,
            onToggle: {
                viewModel.toggleTodo(todo, allTodos: todos, lists: orderedLists)
                syncService.syncAfterAction()
            },
            onToggleSticky: {
                viewModel.toggleSticky(todo)
                syncService.syncAfterAction()
            },
            onSave: { title, notes, dueDate, recurrence, sticky in
                viewModel.updateTodo(
                    todo,
                    title: title,
                    notes: notes,
                    dueDate: dueDate,
                    recurrence: recurrence,
                    sticky: sticky
                )
                syncService.syncAfterAction()
            },
            onAddSubtask: { title in
                viewModel.addSubtask(
                    title: title,
                    parent: todo,
                    context: modelContext,
                    userId: authService.userId,
                    allTodos: todos
                )
                syncService.syncAfterAction()
            },
            onToggleSubtask: { subtask in
                viewModel.toggleSubtask(subtask)
                syncService.syncAfterAction()
            },
            onDeleteSubtask: { subtask in
                viewModel.deleteTodo(subtask, context: modelContext)
                syncService.syncAfterAction()
            },
            onMoveSubtask: { source, destination in
                viewModel.moveSubtask(
                    from: source,
                    to: destination,
                    parent: todo,
                    allTodos: todos
                )
                syncService.syncAfterAction()
            },
            onMoveToList: { listId in
                guard let uuid = UUID(uuidString: listId) else { return }
                viewModel.moveTodoToList(todo, to: uuid, allTodos: todos)
                syncService.syncAfterAction()
            }
        )
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
        .transition(.asymmetric(
            insertion: .move(edge: .top).combined(with: .opacity),
            removal: .move(edge: .trailing).combined(with: .opacity)
        ))
        // Stages the delete for confirmation instead of removing immediately.
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { pendingDeleteTodo = todo } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func confirmPendingDelete() {
        guard let todo = pendingDeleteTodo else { return }
        withAnimation(.easeInOut(duration: 0.3)) {
            viewModel.deleteTodo(todo, context: modelContext)
        }
        syncService.syncAfterAction()
        pendingDeleteTodo = nil
    }

    /// The lifted row while it's being dragged: the row content floated onto a
    /// Liquid Glass card with a hairline ring. This is what makes the drag read
    /// as glass — SwiftUI's default `.onMove` lift is an opaque platter we can't
    /// restyle, so we render our own preview. Interactivity is irrelevant here
    /// (the system snapshots it into a static image), so the row's handlers are
    /// no-ops.
    @ViewBuilder
    private func dragPreview(for todo: TodoItem) -> some View {
        TodoItemRow(
            todo: todo,
            apiService: syncService.apiService,
            urls: todo.urls.map { APITodoUrl(from: $0, todoId: todo.id.uuidString.lowercased()) },
            subtasks: subtasks(of: todo),
            onToggle: {},
            onSave: { _, _, _, _, _ in }
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
        .frame(maxWidth: 360, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color.appLine.opacity(0.5), lineWidth: 0.5)
        )
    }

    /// Land a dragged incomplete row at the dropped-on row's slot. `targetIndex`
    /// is the drop target's index within `incomplete`; a drag downward inserts
    /// after it, upward inserts before it — matching `List.onMove`'s offset
    /// semantics so `viewModel.moveTodo` behaves exactly as it did under
    /// `.onMove`.
    private func handleReorderDrop(
        _ items: [String],
        ontoIndex targetIndex: Int,
        in incomplete: [TodoItem]
    ) -> Bool {
        dropTargetId = nil
        guard let draggedId = items.first,
              let sourceIndex = incomplete.firstIndex(where: {
                  $0.id.uuidString == draggedId
              }),
              sourceIndex != targetIndex else { return false }

        let destination = sourceIndex < targetIndex ? targetIndex + 1 : targetIndex
        withAnimation(.easeInOut(duration: 0.25)) {
            viewModel.moveTodo(
                from: IndexSet(integer: sourceIndex),
                to: destination,
                in: incomplete
            )
        }
        syncService.syncAfterAction()
        return true
    }
}

#Preview {
    ContentView()
        .modelContainer(for: [TodoItem.self, TodoUrl.self, TodoMessage.self, TodoListModel.self], inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
