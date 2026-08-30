//
//  TaskListView.swift
//  Nylon Impossible
//
//  The scrollable todo list for a single list page — extracted from
//  ContentView so each type stays within SwiftLint's length limits. Reads the
//  same services from the environment and drives the view model directly, so
//  the parent only hands it the page's todos plus the pending-delete state it
//  owns.
//
//  Reordering uses `List`'s native `.onMove` rather than a custom
//  `.draggable`/`.dropDestination` pair: the latter renders a nicer Liquid
//  Glass lift, but `.dropDestination` inside a `List` never fires its drop
//  callbacks on iOS when the drag source and drop target are rows in the same
//  list (a longstanding, still-unresolved platform bug — confirmed on both
//  Simulator and a physical device here) — see
//  https://developer.apple.com/forums/thread/730367. `.onMove` uses a
//  different, unaffected mechanism, at the cost of the system's plain opaque
//  lift platter instead of a custom preview.

import SwiftData
import SwiftUI

struct TaskListView: View {
    let pageTodos: [TodoItem]
    /// All todos (unscoped) — needed for subtask lookups and the view model's
    /// allTodos-aware mutations.
    let allTodos: [TodoItem]
    let orderedLists: [TodoListModel]
    let viewModel: TodoViewModel
    /// True on the synthesized Completed page. `pageTodos` there is already
    /// 100% completed items (see `ContentView.sortedTodosList`), so this skips
    /// the incomplete/completed split and the `hideCompleted`-gated accordion
    /// below — otherwise the page would nest a "Completed" toggle inside a
    /// page already titled "Completed", collapsed shut for anyone with
    /// `hideCompleted` on.
    let isCompletedList: Bool
    /// Space the floating header needs above the first row — smaller on the
    /// system lists, which show no title band. See `ContentView.headerInset`.
    let topInset: CGFloat
    /// Rows on their way off this page, mapped to the list they went to — see
    /// `ListMoveTracker`. Each is still rendered (the parent keeps it in
    /// `pageTodos`) but dimmed, inert, and wearing its destination chip.
    var departures: [UUID: String] = [:]
    /// Rows that landed here from another list and haven't been seen yet.
    var arrivals: Set<UUID> = []
    /// Staged by swipe-to-delete; the parent owns the confirmation dialog.
    @Binding var pendingDeleteTodo: TodoItem?

    @Environment(\.modelContext) private var modelContext
    @Environment(AuthService.self) private var authService
    @Environment(SyncService.self) private var syncService
    @Environment(UserPreferencesService.self) private var preferencesService

    /// A todo's subtasks (active + completed), excluding soft-deleted.
    private func subtasks(of todo: TodoItem) -> [TodoItem] {
        allTodos.filter { $0.parentId == todo.id && !$0.isDeleted }
    }

    var body: some View {
        let incomplete = pageTodos.filter { !$0.isEffectivelyCompleted }
        let completed = pageTodos.filter { $0.isEffectivelyCompleted }

        return List {
            if isCompletedList {
                // The Completed page's `pageTodos` is already all-completed —
                // render it flat, with no nested accordion and no
                // `hideCompleted` gate (the page's own title already says
                // "Completed"; a collapsed toggle underneath it would just
                // hide the page's entire reason for existing).
                Section {
                    ForEach(pageTodos) { todo in
                        todoRow(todo)
                            .moveDisabled(true)
                    }
                }
            } else {
                Section {
                    ForEach(incomplete) { todo in
                        todoRow(todo)
                    }
                    .onMove(perform: handleMove)
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
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        // Top inset so the first row starts below the floating header (rows
        // still scroll up behind it), bottom inset so content clears the
        // floating input bar.
        .contentMargins(.top, topInset, for: .scrollContent)
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

    /// The next of the three time-based system lists ("Today" → "This Week"
    /// → "Sometime") after the one `todo` is currently in — the trailing
    /// swipe's "move on" shortcut. `nil` on Sometime (nothing further to
    /// advance to), a custom list, Completed, or if the todo's current list
    /// isn't one of `orderedLists` for some reason.
    private func nextSystemList(after todo: TodoItem) -> TodoListModel? {
        guard let currentKind = orderedLists.first(where: { $0.id == todo.listKey })?.systemKind else {
            return nil
        }
        let nextKind: SystemListKind
        switch currentKind {
        case .today: nextKind = .thisWeek
        case .thisWeek: nextKind = .sometime
        case .sometime, .completed: return nil
        }
        return orderedLists.first { $0.systemKind == nextKind }
    }

    @ViewBuilder
    private func todoRow(_ todo: TodoItem) -> some View {
        let departingTo = departures[todo.id]
        let arrived = arrivals.contains(todo.id)

        let toggleSticky = {
            viewModel.toggleSticky(todo)
            syncService.syncAfterAction()
        }
        let moveToList: (String) -> Void = { listId in
            viewModel.moveTodoToList(todo, to: listId, allTodos: allTodos)
            syncService.syncAfterAction()
        }

        TodoItemRow(
            todo: todo,
            apiService: syncService.apiService,
            urls: todo.urls.map { APITodoUrl(from: $0, todoId: todo.id.uuidString.lowercased()) },
            subtasks: subtasks(of: todo),
            availableLists: orderedLists.filter { $0.systemKind != .completed },
            onToggle: {
                viewModel.toggleTodo(todo, allTodos: allTodos, lists: orderedLists)
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
                    allTodos: allTodos
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
                    allTodos: allTodos
                )
                syncService.syncAfterAction()
            },
            onMoveToList: moveToList
        )
        // A row that just landed here from another list is washed in brand
        // colour until it's been seen, so a refresh that silently gains todos
        // says which ones are new to the page. Bled past the row's own bounds
        // so it reads as a highlight behind the content, not a badge on it.
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.appBrand.opacity(arrived ? 0.14 : 0))
                .padding(.horizontal, -8)
                .padding(.vertical, -4)
        )
        // A departing row is on its way out — dimmed, and inert so it can't be
        // toggled or opened in the beat before it goes.
        .opacity(departingTo == nil ? 1 : 0.55)
        .allowsHitTesting(departingTo == nil)
        .overlay(alignment: .trailing) {
            if let departingTo {
                MovingToListChip(listName: departingTo)
                    .transition(.scale(scale: 0.85).combined(with: .opacity))
            }
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
        // Removal slides toward the trailing edge — the direction the next
        // list sits in the pager — so a swept row reads as moving on rather
        // than being deleted.
        .transition(.asymmetric(
            insertion: .move(edge: .top).combined(with: .opacity),
            removal: .move(edge: .trailing).combined(with: .opacity)
        ))
        // "Move on" — leading edge, so swiping right advances a todo to the
        // next time-based list. Only offered on Today/This Week, where
        // "next" is well defined.
        .swipeActions(edge: .leading) {
            if !todo.isEffectivelyCompleted, let nextList = nextSystemList(after: todo) {
                Button {
                    moveToList(nextList.id)
                } label: {
                    Label("Move to \(nextList.name)", systemImage: "arrow.right")
                }
                .tint(Color.appAccent)
            }
        }
        // Delete stays first (and so keeps triggering on a full swipe,
        // SwiftUI's default for a trailing edge's first action) — pin is a
        // second, partial-swipe-only action alongside it. Pin hides once
        // completed, matching the old persistent button (see TodoItemRow's
        // pin indicator) — completing already clears sticky.
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { pendingDeleteTodo = todo } label: {
                Label("Delete", systemImage: "trash")
            }
            if !todo.isEffectivelyCompleted {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        toggleSticky()
                    }
                } label: {
                    Label(todo.sticky ? "Unpin" : "Pin", systemImage: todo.sticky ? "pin.slash.fill" : "pin.fill")
                }
                .tint(Color.appAccent)
            }
        }
    }

    /// `List.onMove`'s handler for the incomplete section. `incomplete` is
    /// recomputed fresh each `body` evaluation, so this closure always closes
    /// over the same position-ordered array the indices were computed
    /// against.
    private func handleMove(from source: IndexSet, to destination: Int) {
        // Rows that have already left this list (held on screen for their
        // exit) are still in `pageTodos`, but their positions are no longer
        // comparable with this list's. Rather than compute a new index
        // against them, sit the move out — it's a sub-second window, and the
        // row simply stays put.
        guard departures.isEmpty else { return }
        let incomplete = pageTodos.filter { !$0.isEffectivelyCompleted }
        viewModel.moveTodo(from: source, to: destination, in: incomplete)
        syncService.syncAfterAction()
    }
}
