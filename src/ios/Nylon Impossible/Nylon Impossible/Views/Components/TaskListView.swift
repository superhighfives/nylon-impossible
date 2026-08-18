//
//  TaskListView.swift
//  Nylon Impossible
//
//  The scrollable todo list for a single list page — extracted from
//  ContentView so each type stays within SwiftLint's length limits. Reads the
//  same services from the environment and drives the view model directly, so
//  the parent only hands it the page's todos plus the two pieces of drag/delete
//  state it owns.
//

import SwiftData
import SwiftUI

struct TaskListView: View {
    let pageTodos: [TodoItem]
    /// All todos (unscoped) — needed for subtask lookups and the view model's
    /// allTodos-aware mutations.
    let allTodos: [TodoItem]
    let orderedLists: [TodoListModel]
    let viewModel: TodoViewModel
    /// The incomplete row a drag is hovering over — owned by the parent because
    /// its "drop here" line is shared board state.
    @Binding var dropTargetId: UUID?
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
        .contentMargins(.top, 118, for: .scrollContent)
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
                viewModel.toggleTodo(todo, allTodos: allTodos, lists: orderedLists)
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
            onMoveToList: { listId in
                viewModel.moveTodoToList(todo, to: listId, allTodos: allTodos)
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
