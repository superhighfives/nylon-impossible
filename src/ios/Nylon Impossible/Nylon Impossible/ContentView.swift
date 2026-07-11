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
    @State private var viewModel = TodoViewModel()
    // Bumped at each local midnight so repeats completed "today" derive back to
    // active (isEffectivelyCompleted flips) without a refetch. Any @State write
    // re-runs body, which recomputes the sorted/filtered lists.
    @State private var midnightTick = 0

    // Subtasks live inside their parent's edit sheet, not as their own rows, so
    // the main list is top-level todos only.
    private var sortedTodosList: [TodoItem] {
        viewModel.sortedTodos(from: todos.filter { $0.parentId == nil })
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

            VStack(spacing: 24) {
                HeaderView(
                    onSignOut: {
                        Task { await authService.signOut() }
                    },
                    syncState: syncService.state
                )

                // Task list or empty state
                if sortedTodosList.isEmpty {
                    ScrollView {
                        EmptyStateView()
                            .transition(.opacity)
                            .frame(maxWidth: .infinity)
                            .padding(.bottom, 100)
                    }
                } else {
                    taskListView
                }
            }
            .padding(.horizontal, 16)

            // Floating input bar — liquid glass, always fixed to bottom
            VStack(spacing: 0) {
                AddTaskInputView(
                    text: $viewModel.newTaskText,
                    canAdd: viewModel.canAddTask
                ) {
                    let text = viewModel.newTaskText
                    viewModel.newTaskText = ""
                    Task {
                        await syncService.smartCreate(
                            text: text,
                            context: modelContext,
                            userId: authService.userId,
                            allTodos: todos
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 6)
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .animation(.easeInOut(duration: 0.3), value: sortedTodosList.count)
        .refreshable {
            await syncService.sync()
        }
        .task {
            await scheduleMidnightTicks()
        }
    }

    private var taskListView: some View {
        let incomplete = sortedTodosList.filter { !$0.isEffectivelyCompleted }
        let completed = sortedTodosList.filter { $0.isEffectivelyCompleted }

        return List {
            Section {
                ForEach(incomplete) { todo in
                    todoRow(todo)
                }
                .onMove { source, destination in
                    viewModel.moveTodo(from: source, to: destination, in: sortedTodosList)
                    syncService.syncAfterAction()
                }
                .onDelete { offsets in
                    for index in offsets {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            viewModel.deleteTodo(incomplete[index], context: modelContext)
                        }
                    }
                    syncService.syncAfterAction()
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
                        .onDelete { offsets in
                            for index in offsets {
                                withAnimation(.easeInOut(duration: 0.3)) {
                                    viewModel.deleteTodo(completed[index], context: modelContext)
                                }
                            }
                            syncService.syncAfterAction()
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        // Extra bottom padding so content clears the floating input bar
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
            onToggle: {
                viewModel.toggleTodo(todo, allTodos: todos)
                syncService.syncAfterAction()
            },
            onSave: { title, notes, dueDate, priority, recurrence in
                viewModel.updateTodo(
                    todo,
                    title: title,
                    notes: notes,
                    dueDate: dueDate,
                    priority: priority,
                    recurrence: recurrence
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
            }
        )
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
        .transition(.asymmetric(
            insertion: .move(edge: .top).combined(with: .opacity),
            removal: .move(edge: .trailing).combined(with: .opacity)
        ))
    }
}

#Preview {
    ContentView()
        .modelContainer(for: [TodoItem.self, TodoUrl.self, TodoMessage.self], inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
