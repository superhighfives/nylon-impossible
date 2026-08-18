//
//  ReorderListsView.swift
//  Nylon Impossible
//

import SwiftData
import SwiftUI

/// Drag-to-reorder sheet for custom lists — the iOS stand-in for web's
/// draggable list columns, which don't map onto the paged TabView. System
/// lists (Today / This Week / Sometime) are pinned to their fixed order and
/// never appear here. Each move recomputes the dragged list's fractional
/// position between its new neighbors via `TodoViewModel.reorderList`.
struct ReorderListsView: View {
    let viewModel: TodoViewModel
    let apiService: any APIProviding
    var onMutate: () -> Void = {}

    @Environment(\.dismiss) private var dismiss

    // A local, optimistic copy so `.onMove` animates immediately; the async
    // reorder call reconciles `position` behind it and the parent @Query
    // re-sorts on return.
    @State private var ordered: [TodoListModel]
    @State private var errorMessage: String?

    init(
        customLists: [TodoListModel],
        viewModel: TodoViewModel,
        apiService: any APIProviding,
        onMutate: @escaping () -> Void = {}
    ) {
        self.viewModel = viewModel
        self.apiService = apiService
        self.onMutate = onMutate
        _ordered = State(initialValue: customLists)
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(ordered) { list in
                    HStack {
                        Text(list.name)
                        Spacer()
                        Image(systemName: "line.3.horizontal")
                            .foregroundStyle(Color.appSubtle)
                    }
                }
                .onMove(perform: move)
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Reorder Lists")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
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

    private func move(from source: IndexSet, to destination: Int) {
        // Capture the dragged list (and its pre-move order, for rollback) before
        // mutating, then apply the move to the local copy and reposition it
        // between its resulting neighbors.
        let previousOrder = ordered
        let moved = source.map { ordered[$0] }
        ordered.move(fromOffsets: source, toOffset: destination)
        guard let movedList = moved.first,
              let newIndex = ordered.firstIndex(where: { $0.id == movedList.id })
        else { return }

        let prev = newIndex > 0 ? ordered[newIndex - 1] : nil
        let next = newIndex < ordered.count - 1 ? ordered[newIndex + 1] : nil

        Task {
            do {
                try await viewModel.reorderList(
                    movedList,
                    prev: prev,
                    next: next,
                    apiService: apiService
                )
                onMutate()
            } catch {
                // The optimistic move never persisted — snap back so the sheet
                // doesn't show an order the server never agreed to.
                ordered = previousOrder
                errorMessage = "Couldn't save the new order. Try again."
            }
        }
    }
}
