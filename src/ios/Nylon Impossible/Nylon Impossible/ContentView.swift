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
    // Raised to open the keyboard on the add-task field without a tap — the
    // Home Screen "New Task" quick action. AddTaskInputView lowers it again
    // once it has focus.
    @State private var focusAddTask = false

    /// Lists in the fixed order: Today, This Week, Sometime, then custom
    /// lists by position. Mirrors web's `TodoGrid` ordering.
    ///
    /// Excludes the `completed` system list: unlike the other system lists,
    /// no todo's `listId` ever points at it (its web counterpart is a
    /// synthesized aggregate across every list, not a real scope) — a
    /// per-list page for it would just be permanently empty.
    private var orderedLists: [TodoListModel] {
        lists
            .filter { $0.systemKind != .completed }
            .sorted { a, b in
                if a.isSystem != b.isSystem { return a.isSystem }
                if a.isSystem && b.isSystem { return a.systemSortIndex < b.systemSortIndex }
                return a.position < b.position
            }
    }

    /// The list currently paged into view, driving the floating list header.
    private var selectedList: TodoListModel? {
        orderedLists.first { $0.id == viewModel.selectedListId }
    }

    /// Subtasks live inside their parent's edit sheet, not as their own rows,
    /// so a list's page is top-level todos only, scoped to that list. List
    /// scoping itself lives in `TodoViewModel.sortedTodos` — this only needs
    /// to strip out subtasks first.
    private func sortedTodosList(for listId: String?) -> [TodoItem] {
        let topLevel = todos.filter { $0.parentId == nil }
        return viewModel.sortedTodos(from: topLevel, listId: listId)
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
                                    .padding(.top, 118)
                                    .padding(.bottom, 100)
                            }
                        } else {
                            TaskListView(
                                pageTodos: pageTodos,
                                allTodos: todos,
                                orderedLists: orderedLists,
                                viewModel: viewModel,
                                dropTargetId: $dropTargetId,
                                pendingDeleteTodo: $pendingDeleteTodo
                            )
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

                // The selected list's title + a "+" to add a list, mirroring
                // web's per-column header. Also the only cue for which list
                // you're on, since the paged TabView hides its page dots.
                if let selectedList, let apiService = syncService.apiService {
                    ListHeaderView(
                        list: selectedList,
                        viewModel: viewModel,
                        apiService: apiService,
                        existingLists: orderedLists,
                        modelContext: modelContext,
                        onMutate: { syncService.syncAfterAction() }
                    )
                    .padding(.top, 10)
                }

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
                aiAvailable: preferencesService.aiEnabled,
                focusRequested: $focusAddTask
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
                    listId: viewModel.selectedListId
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
        // Quick actions are parked on QuickActionService by the scene delegate
        // because they can land before this view exists. On appear for one
        // that was already waiting (launched from the icon, or held while
        // signed out); on change for one that arrives while the app is on
        // screen.
        .onAppear { performPendingQuickAction() }
        .onChange(of: QuickActionService.shared.pending) { performPendingQuickAction() }
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

    /// Perform whatever quick action is waiting, if any. The action stays on
    /// whichever list is showing rather than paging to a fixed one — the list
    /// header names it, and the task lands where the user is already looking.
    private func performPendingQuickAction() {
        guard let action = QuickActionService.shared.take() else { return }
        switch action {
        case .newTask:
            focusAddTask = true
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

}

#Preview {
    ContentView()
        .modelContainer(for: [TodoItem.self, TodoUrl.self, TodoMessage.self, TodoListModel.self], inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
