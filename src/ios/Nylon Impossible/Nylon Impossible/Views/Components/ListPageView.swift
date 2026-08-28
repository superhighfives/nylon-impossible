//
//  ListPageView.swift
//  Nylon Impossible
//
//  One list's page in the pager — the empty state or the task list, plus the
//  bookkeeping that makes a todo crossing lists visible (see `ListMoveTracker`).
//
//  The empty state lives here rather than in `ContentView` for a reason: a
//  swept Today list usually empties completely, and if the parent swapped the
//  whole page out the moment `pageTodos` went empty, the departing rows would
//  be torn down mid-exit and the animation would never play. Holding both
//  branches behind the same `displayedTodos` keeps the empty state waiting
//  until the last row has actually left.
//

import SwiftUI

struct ListPageView: View {
    let list: TodoListModel
    /// This list's own top-level todos, already scoped and sorted by the parent.
    let pageTodos: [TodoItem]
    /// All todos (unscoped) — subtask lookups, the view model's allTodos-aware
    /// mutations, and finding a row that has moved off this page.
    let allTodos: [TodoItem]
    let orderedLists: [TodoListModel]
    let viewModel: TodoViewModel
    /// Space the floating header needs above this page's content — smaller on
    /// the system lists, which show no title band. See `ContentView.headerInset`.
    /// Both branches take it, so the empty state sits where the first row would.
    let topInset: CGFloat
    @Binding var dropTargetId: UUID?
    @Binding var pendingDeleteTodo: TodoItem?

    @State private var moves = ListMoveTracker()

    private var isVisible: Bool {
        viewModel.selectedListId == list.id
    }

    /// The page's todos plus any the tracker is still holding on to — one that
    /// has left for another list and hasn't finished its exit, or one that left
    /// between this render and the `onChange` that will classify it.
    ///
    /// A held todo keeps its natural slot: it still carries its `position` and
    /// `sticky`, so re-sorting the combined set puts it back exactly where it
    /// was. A held todo that has actually been deleted simply isn't in
    /// `allTodos` any more, so it falls out here without special handling.
    private var displayedTodos: [TodoItem] {
        let pageIds = Set(pageTodos.map(\.id))
        let held = allTodos.filter {
            !pageIds.contains($0.id) && moves.retained.contains($0.id)
                && !$0.isDeleted && $0.parentId == nil
        }
        guard !held.isEmpty else { return pageTodos }
        return viewModel.sortedTodos(from: pageTodos + held)
    }

    var body: some View {
        let displayed = displayedTodos

        return Group {
            if displayed.isEmpty {
                ScrollView {
                    // Completed has no add-todo field (see ContentView), so
                    // its empty copy drops the "add a todo below" cue.
                    if list.systemKind == .completed {
                        EmptyStateView(
                            icon: "checkmark.circle",
                            title: "Nothing completed yet",
                            message: "Todos you finish anywhere show up here."
                        )
                        .transition(.opacity)
                        .frame(maxWidth: .infinity)
                        .padding(.top, topInset)
                        .padding(.bottom, 100)
                    } else {
                        EmptyStateView()
                            .transition(.opacity)
                            .frame(maxWidth: .infinity)
                            .padding(.top, topInset)
                            .padding(.bottom, 100)
                    }
                }
            } else {
                TaskListView(
                    pageTodos: displayed,
                    allTodos: allTodos,
                    orderedLists: orderedLists,
                    viewModel: viewModel,
                    topInset: topInset,
                    departures: moves.departures,
                    arrivals: moves.arrivals,
                    dropTargetId: $dropTargetId,
                    pendingDeleteTodo: $pendingDeleteTodo
                )
            }
        }
        // Sync writes land outside any animation transaction (SwiftData drives
        // them through @Query), so without this the rows a sweep adds or
        // removes would pop in and out with no transition at all. Keyed on the
        // rendered ids so it only ever covers rows arriving and leaving.
        .animation(ListMoveTracker.membershipAnimation, value: displayed.map(\.id))
        .onChange(of: pageTodos.map(\.id)) { previousIds, currentIds in
            moves.reconcile(
                previousIds: previousIds,
                currentIds: currentIds,
                allTodos: allTodos,
                lists: orderedLists,
                listId: list.id
            )
            if isVisible { moves.pageBecameVisible() }
        }
        .onChange(of: isVisible) { _, visible in
            if visible { moves.pageBecameVisible() }
        }
        .onAppear {
            moves.establishBaseline(ids: pageTodos.map(\.id))
        }
    }
}
