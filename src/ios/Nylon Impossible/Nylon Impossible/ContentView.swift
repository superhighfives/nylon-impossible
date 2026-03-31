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
    @Query(sort: \TodoItem.createdAt, order: .reverse) private var todos: [TodoItem]
    @State private var viewModel = TodoViewModel()

    /// Whether the floating input bar is visible (hide on scroll down, show on scroll up)
    @State private var inputBarVisible: Bool = true

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

            // Floating input bar — liquid glass, hides on scroll down, shows on scroll up
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
                .padding(.top, 12)
                .padding(.bottom, 8)
            }
            .background(.ultraThinMaterial)
            .offset(y: inputBarVisible ? 0 : 120)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: inputBarVisible)
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
                    Text("Completed")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.appSubtle)
                        .textCase(nil)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 16, leading: 4, bottom: 4, trailing: 0))
                        .moveDisabled(true)

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
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        // Extra bottom padding so content clears the floating input bar
        .contentMargins(.bottom, 100, for: .scrollContent)
        // Detect scroll direction to show/hide the floating input bar
        .onScrollGeometryChange(for: CGFloat.self, of: { $0.contentOffset.y }) { oldY, newY in
            let delta = newY - oldY
            if delta > 10 {
                if inputBarVisible { inputBarVisible = false }
            } else if delta < -10 {
                if !inputBarVisible { inputBarVisible = true }
            }
        }
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
            onSave: { title, notes, dueDate, priority in
                viewModel.updateTodo(
                    todo,
                    title: title,
                    notes: notes,
                    dueDate: dueDate,
                    priority: priority
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
        .modelContainer(for: [TodoItem.self, TodoUrl.self], inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
