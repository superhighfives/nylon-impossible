//
//  SuggestionsSection.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 8/7/26.
//

import SwiftData
import SwiftUI

/// Shows the agent's proposed enrichment changes as single-tap buttons the
/// user accepts or dismisses. Accept applies the field locally first (where
/// it maps onto a single todo field), so it survives offline; subtasks and
/// research reconcile via the next sync.
struct SuggestionsSection: View {
    let todo: TodoItem
    let apiService: APIService?

    @Environment(\.modelContext) private var modelContext
    @State private var pendingIds: Set<String> = []

    private var pending: [TodoSuggestion] {
        todo.suggestions.filter { $0.isPending }.sorted { $0.createdAt < $1.createdAt }
    }

    var body: some View {
        if !pending.isEmpty {
            Section {
                ForEach(pending) { suggestion in
                    HStack {
                        Text(suggestion.label)
                            .font(.subheadline)
                        Spacer(minLength: 8)
                        Button("Accept") {
                            Task { await accept(suggestion) }
                        }
                        .disabled(pendingIds.contains(suggestion.id))
                        Button("Dismiss") {
                            Task { await dismiss(suggestion) }
                        }
                        .disabled(pendingIds.contains(suggestion.id))
                    }
                }

                if pending.count > 1 {
                    Button("Accept all") {
                        Task {
                            for suggestion in pending {
                                await accept(suggestion)
                            }
                        }
                    }
                }
            } header: {
                Text("Suggestions")
            }
        }
    }

    private func accept(_ suggestion: TodoSuggestion) async {
        pendingIds.insert(suggestion.id)
        defer { pendingIds.remove(suggestion.id) }

        // Optimistic: apply the field locally and mark accepted immediately.
        suggestion.applyLocally(to: todo)
        suggestion.status = "accepted"
        try? modelContext.save()

        guard let apiService else { return }
        do {
            try await apiService.acceptSuggestion(
                todoId: todo.id.uuidString.lowercased(),
                suggestionId: suggestion.id
            )
        } catch {
            // Left applied locally; next sync reconciles with server state.
        }
    }

    private func dismiss(_ suggestion: TodoSuggestion) async {
        pendingIds.insert(suggestion.id)
        defer { pendingIds.remove(suggestion.id) }

        suggestion.status = "dismissed"
        try? modelContext.save()

        guard let apiService else { return }
        do {
            try await apiService.dismissSuggestion(
                todoId: todo.id.uuidString.lowercased(),
                suggestionId: suggestion.id
            )
        } catch {
            // Left dismissed locally; next sync reconciles with server state.
        }
    }
}
