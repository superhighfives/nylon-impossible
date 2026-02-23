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
    
    private var filteredTodos: [TodoItem] {
        viewModel.filteredTodos(from: todos)
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
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        viewModel.addTodo(context: modelContext, userId: authService.userId)
                    }
                    syncService.syncAfterAction()
                }
                
                FilterTabsView(selectedFilter: $viewModel.selectedFilter)
                
                // Task list or empty state
                if filteredTodos.isEmpty {
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
        .animation(.easeInOut(duration: 0.3), value: filteredTodos.count)
        .refreshable {
            await syncService.sync()
        }
    }
    
    private var taskListView: some View {
        List {
            ForEach(filteredTodos) { todo in
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
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
    }
}

#Preview {
    ContentView()
        .modelContainer(for: TodoItem.self, inMemory: true)
        .environment(AuthService())
        .environment(SyncService(authService: AuthService()))
}
