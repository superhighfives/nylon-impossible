//
//  ContentView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(AuthService.self) private var authService
    @Environment(SyncService.self) private var syncService
    @Query(sort: \TodoItem.createdAt, order: .reverse) private var todos: [TodoItem]
    @State private var viewModel = TodoViewModel()
    @State private var draggedTodo: TodoItem?

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
                        .onDrag {
                            draggedTodo = todo
                            return NSItemProvider(object: todo.id.uuidString as NSString)
                        }
                        .onDrop(of: [UTType.text], delegate: TodoReorderDropDelegate(
                            item: todo,
                            items: incomplete,
                            draggedItem: $draggedTodo,
                            onReorder: { source, destination in
                                viewModel.moveTodo(from: source, to: destination, in: sortedTodosList)
                                syncService.syncAfterAction()
                            }
                        ))
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
                        .foregroundStyle(Color.kumoSubtle)
                        .textCase(nil)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 16, leading: 4, bottom: 4, trailing: 0))

                    ForEach(completed) { todo in
                        todoRow(todo)
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
    }

    @ViewBuilder
    private func todoRow(_ todo: TodoItem) -> some View {
        TodoItemRow(
            todo: todo,
            onToggle: {
                viewModel.toggleTodo(todo)
                syncService.syncAfterAction()
            },
            onEdit: { newTitle in
                viewModel.updateTodoTitle(todo, title: newTitle)
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

private struct TodoReorderDropDelegate: DropDelegate {
    let item: TodoItem
    let items: [TodoItem]
    @Binding var draggedItem: TodoItem?
    let onReorder: (IndexSet, Int) -> Void

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        guard let draggedItem,
              draggedItem.id != item.id,
              let from = items.firstIndex(where: { $0.id == draggedItem.id }),
              let to = items.firstIndex(where: { $0.id == item.id }) else {
            self.draggedItem = nil
            return false
        }
        let destination = from < to ? to + 1 : to
        withAnimation(.easeInOut(duration: 0.2)) {
            onReorder(IndexSet(integer: from), destination)
        }
        self.draggedItem = nil
        return true
    }
}

#Preview {
    ContentView()
        .modelContainer(for: TodoItem.self, inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
