//
//  NewListButton.swift
//  Nylon Impossible
//

import SwiftData
import SwiftUI

/// The "+" that creates a custom list. It rides in the top header next to the
/// avatar menu rather than beside the list title, so it reads as a global
/// action (like web's "New List" column) instead of something scoped to the
/// list you happen to be on.
struct NewListButton: View {
    let viewModel: TodoViewModel
    let apiService: any APIProviding
    let existingLists: [TodoListModel]
    let modelContext: ModelContext
    /// Called after the create lands so the caller can kick a sync.
    var onMutate: () -> Void = {}

    @State private var showNewListAlert = false
    @State private var newListName = ""
    @State private var errorMessage: String?

    var body: some View {
        Button {
            newListName = ""
            showNewListAlert = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.appStrong)
                // Matches the header pill's 44pt tap target and glass treatment
                // so the two read as one row of controls.
                .frame(width: 44, height: 44)
                .glassEffect(.regular, in: .circle)
                .overlay(
                    Circle()
                        .strokeBorder(Color.appLine.opacity(0.5), lineWidth: 0.5)
                )
                .contentShape(Circle())
        }
        .accessibilityLabel("New list")
        .alert("New List", isPresented: $showNewListAlert) {
            TextField("List name", text: $newListName)
            Button("Cancel", role: .cancel) {}
            Button("Create") { createList() }
        } message: {
            Text("Add a new custom list.")
        }
        .alert(
            "Error",
            isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func createList() {
        let trimmed = newListName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task {
            do {
                let created = try await viewModel.createList(
                    name: trimmed,
                    apiService: apiService,
                    context: modelContext,
                    existingLists: existingLists
                )
                // Page straight to the freshly-created list, like web scrolls
                // its new column into view.
                viewModel.selectList(created.id)
                onMutate()
            } catch {
                errorMessage = "Couldn't create list. Try again."
            }
        }
    }
}
