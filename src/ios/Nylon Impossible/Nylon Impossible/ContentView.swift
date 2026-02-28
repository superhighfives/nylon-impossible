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
                    syncState: syncService.state,
                    todoCount: sortedTodosList.filter { !$0.isCompleted }.count
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
                        .draggable(todo.id.uuidString)
                        .dropDestination(for: String.self) { items, _ in
                            guard let draggedIdString = items.first,
                                  let draggedId = UUID(uuidString: draggedIdString),
                                  draggedId != todo.id else { return false }

                            let sorted = incomplete
                            guard let sourceIndex = sorted.firstIndex(where: { $0.id == draggedId }),
                                  let destIndex = sorted.firstIndex(where: { $0.id == todo.id }) else { return false }

                            viewModel.moveTodo(
                                from: IndexSet(integer: sourceIndex),
                                to: destIndex > sourceIndex ? destIndex + 1 : destIndex,
                                in: sortedTodosList
                            )
                            syncService.syncAfterAction()
                            return true
                        }
                }
            }

            if !completed.isEmpty {
                Section {
                    Text("Completed")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.kumoSubtle)
                        .textCase(nil)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 16, leading: 4, bottom: 4, trailing: 0))

                    ForEach(completed) { todo in
                        todoRow(todo)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
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
