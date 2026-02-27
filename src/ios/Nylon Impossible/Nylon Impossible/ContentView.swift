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

    private var sortedTodosList: [TodoItem] {
        viewModel.sortedTodos(from: todos)
    }

    var body: some View {
        ZStack {
            GradientBackground()

            VStack(spacing: 24) {
                HeaderView(
                    onSignOut: {
                        Task { await authService.signOut() }
                    },
                    syncState: syncService.state
                )

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

                // Task list or empty state
                if sortedTodosList.isEmpty {
                    ScrollView {
                        EmptyStateView()
                            .transition(.opacity)
                            .frame(maxWidth: .infinity)
                    }
                } else {
                    taskListView
                }
            }
            .padding(.horizontal, 16)
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
                .deleteDisabled(true)
            }

            if !completed.isEmpty {
                Section {
                    ForEach(completed) { todo in
                        todoRow(todo)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .environment(\.editMode, .constant(.active))
    }

    @ViewBuilder
    private func todoRow(_ todo: TodoItem) -> some View {
        TodoItemRow(todo: todo) {
            viewModel.toggleTodo(todo)
            syncService.syncAfterAction()
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
        .transition(.asymmetric(
            insertion: .move(edge: .top).combined(with: .opacity),
            removal: .move(edge: .trailing).combined(with: .opacity)
        ))
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                withAnimation(.easeInOut(duration: 0.3)) {
                    viewModel.deleteTodo(todo, context: modelContext)
                }
                syncService.syncAfterAction()
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(for: TodoItem.self, inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
