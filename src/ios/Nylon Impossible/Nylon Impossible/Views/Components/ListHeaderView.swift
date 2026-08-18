//
//  ListHeaderView.swift
//  Nylon Impossible
//

import SwiftData
import SwiftUI

/// Floating title bar for the currently-selected list — the iOS analogue of
/// web's per-column title band. Shows the list name and a "+" to create a new
/// list. Custom lists can be renamed or deleted from a menu on the title;
/// system lists (Today / This Week / Sometime) show a plain, immutable name,
/// matching web where system lists can't be renamed or removed.
struct ListHeaderView: View {
    let list: TodoListModel
    let viewModel: TodoViewModel
    let apiService: any APIProviding
    let existingLists: [TodoListModel]
    let modelContext: ModelContext
    /// Called after a create/rename/delete lands so the caller can kick a sync.
    var onMutate: () -> Void = {}

    @State private var showNewListAlert = false
    @State private var newListName = ""
    @State private var showRenameAlert = false
    @State private var renameText = ""
    @State private var showDeleteConfirm = false
    @State private var showReorderSheet = false
    @State private var errorMessage: String?

    private var isCustom: Bool { !list.isSystem }

    /// Custom lists in display order — the reorder sheet's contents, and the
    /// gate for showing "Reorder Lists" (nothing to reorder below two).
    private var customLists: [TodoListModel] {
        existingLists.filter { $0.kind == "custom" }
    }

    var body: some View {
        HStack(spacing: 6) {
            title
            newListButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: .capsule)
        .overlay(
            Capsule()
                .strokeBorder(Color.appLine.opacity(0.5), lineWidth: 0.5)
        )
        .alert("New List", isPresented: $showNewListAlert) {
            TextField("List name", text: $newListName)
            Button("Cancel", role: .cancel) {}
            Button("Create") { createList() }
        } message: {
            Text("Add a new custom list.")
        }
        .alert("Rename List", isPresented: $showRenameAlert) {
            TextField("List name", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Save") { commitRename() }
        }
        .confirmationDialog(
            "Delete “\(list.name)”?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) { deleteList() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Todos in this list will be deleted too. This can't be undone.")
        }
        .sheet(isPresented: $showReorderSheet) {
            ReorderListsView(
                customLists: customLists,
                viewModel: viewModel,
                apiService: apiService,
                onMutate: onMutate
            )
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

    @ViewBuilder
    private var title: some View {
        let label = Text(list.name)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Color.appStrong)
            .lineLimit(1)

        if isCustom {
            Menu {
                Button {
                    renameText = list.name
                    showRenameAlert = true
                } label: {
                    Label("Rename", systemImage: "pencil")
                }
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                if customLists.count >= 2 {
                    Divider()
                    Button {
                        showReorderSheet = true
                    } label: {
                        Label("Reorder Lists", systemImage: "arrow.up.arrow.down")
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    label
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Color.appSubtle)
                }
                .frame(maxWidth: 220)
            }
            .accessibilityLabel("List options for \(list.name)")
        } else {
            label
                .frame(maxWidth: 220)
        }
    }

    private var newListButton: some View {
        Button {
            newListName = ""
            showNewListAlert = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.appStrong)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("New list")
    }

    // MARK: - Actions
    // Each list mutation goes straight to the API via TodoViewModel (which also
    // updates the local SwiftData store), then `onMutate` lets the caller sync.

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

    private func commitRename() {
        let trimmed = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != list.name else { return }
        Task {
            do {
                try await viewModel.renameList(list, name: trimmed, apiService: apiService)
                onMutate()
            } catch {
                errorMessage = "Couldn't rename list. Try again."
            }
        }
    }

    private func deleteList() {
        Task {
            do {
                try await viewModel.deleteList(list, apiService: apiService, context: modelContext)
                onMutate()
            } catch {
                errorMessage = "Couldn't delete list. Try again."
            }
        }
    }
}
