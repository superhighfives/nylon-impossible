//
//  ListHeaderView.swift
//  Nylon Impossible
//

import SwiftData
import SwiftUI

/// Floating title bar for the currently-selected list — the iOS analogue of
/// web's per-column title band. For a **custom** list the name doubles as a
/// menu for renaming, deleting, and reordering; system lists (Today / This
/// Week / Sometime / Completed) can't be renamed or removed, so they get the
/// same capsule with a plain, non-interactive label instead — matching how
/// web's `ListHeader` renders every column's title the same way regardless
/// of `kind`. The three time-based lists still fold their name into the
/// add-todo field's copy too ("What needs to be done **this week**?"), which
/// doubles as the cue for which page you're on now that this title matches
/// it — see `TodoListModel.promptPhrase`.
struct ListHeaderView: View {
    let list: TodoListModel
    let viewModel: TodoViewModel
    let apiService: any APIProviding
    let existingLists: [TodoListModel]
    let modelContext: ModelContext
    /// Called after a rename/delete lands so the caller can kick a sync.
    var onMutate: () -> Void = {}

    @State private var showRenameAlert = false
    @State private var renameText = ""
    @State private var showDeleteConfirm = false
    @State private var showReorderSheet = false
    @State private var errorMessage: String?

    /// Custom lists in display order — the reorder sheet's contents, and the
    /// gate for showing "Reorder Lists" (nothing to reorder below two).
    private var customLists: [TodoListModel] {
        existingLists.filter { $0.kind == "custom" }
    }

    var body: some View {
        Group {
            if list.isSystem {
                systemTitle
            } else {
                title
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: .capsule)
        .overlay(
            Capsule()
                .strokeBorder(Color.appLine.opacity(0.5), lineWidth: 0.5)
        )
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

    /// The plain, non-interactive label system lists get — same capsule,
    /// same typography as a custom list's `title`, minus the menu (rename /
    /// delete / reorder don't apply to Today, This Week, Sometime, or
    /// Completed).
    private var systemTitle: some View {
        Text(list.name)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Color.appStrong)
            .lineLimit(1)
            .frame(maxWidth: 220)
            .accessibilityLabel(list.name)
    }

    private var title: some View {
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
                Text(list.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.appStrong)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color.appSubtle)
            }
            .frame(maxWidth: 220)
        }
        .accessibilityLabel("List options for \(list.name)")
    }

    // MARK: - Actions
    // Each list mutation goes straight to the API via TodoViewModel (which also
    // updates the local SwiftData store), then `onMutate` lets the caller sync.

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
