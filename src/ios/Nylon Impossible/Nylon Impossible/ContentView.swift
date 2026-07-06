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

    private var sortedTodosList: [TodoItem] {
        viewModel.sortedTodos(from: todos)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            GradientBackground()

            VStack(spacing: 24) {
                HeaderView(
                    onSignOut: {
                        Task { await authService.signOut() }
                    },
                    syncState: syncService.state,
                    todoCount: sortedTodosList.filter { !$0.isCompleted }.count
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
    }

    private var taskListView: some View {
        let incomplete = sortedTodosList.filter { !$0.isCompleted }
        let completed = sortedTodosList.filter { $0.isCompleted }

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

            if !completed.isEmpty {
                Section {
                    completedHeader(count: completed.count)

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
        .animation(.easeInOut(duration: 0.25), value: preferencesService.hideCompleted)
        // Extra bottom padding so content clears the floating input bar
        .contentMargins(.bottom, 100, for: .scrollContent)
    }

    @ViewBuilder
    private func todoRow(_ todo: TodoItem) -> some View {
        TodoItemRow(
            todo: todo,
            apiService: syncService.apiService,
            urls: todo.urls.map { APITodoUrl(from: $0, todoId: todo.id.uuidString.lowercased()) },
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

    /// Tappable header that sits between the incomplete and completed todos.
    /// Toggling it collapses/expands the completed section by flipping the
    /// synced `hideCompleted` preference.
    @ViewBuilder
    private func completedHeader(count: Int) -> some View {
        let isCollapsed = preferencesService.hideCompleted

        Button {
            // Capture the intended value synchronously so a concurrent sync
            // flipping `hideCompleted` between tap and task can't invert it.
            let newValue = !preferencesService.hideCompleted
            Task { await preferencesService.setHideCompleted(newValue) }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.appSubtle)
                    .rotationEffect(.degrees(isCollapsed ? 0 : 90))
                    .accessibilityHidden(true)

                Text("Completed")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.appSubtle)

                Text("\(count)")
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Color.appSubtle)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(Color.appSubtle.opacity(0.15)))

                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .textCase(nil)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 16, leading: 4, bottom: 4, trailing: 0))
        .moveDisabled(true)
        // Collapse into one VoiceOver element that conveys the count and the
        // current expanded/collapsed state (the web equivalent of aria-expanded).
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Completed")
        .accessibilityValue("\(count) \(count == 1 ? "todo" : "todos"), \(isCollapsed ? "collapsed" : "expanded")")
        .accessibilityHint(isCollapsed ? "Double tap to show completed todos" : "Double tap to hide completed todos")
    }
}

#Preview {
    ContentView()
        .modelContainer(for: [TodoItem.self, TodoUrl.self, TodoMessage.self], inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
