//
//  ImportReviewSheet.swift
//  Nylon Impossible
//

import SwiftData
import SwiftUI

/// Shown after a Google Tasks import. Google doesn't share repeat schedules over
/// its API, so imported dated tasks arrive as one-offs — this lets the user set
/// how each should repeat. Only tasks with a due date can anchor a schedule, so
/// only those are offered here.
struct ImportReviewSheet: View {
    let datedTodos: [ImportedDatedTodo]

    @Environment(SyncService.self) private var syncService
    @Environment(\.dismiss) private var dismiss
    @Query private var allTodos: [TodoItem]

    /// Resolve the imported ids against live SwiftData, preserving the server's
    /// order (first Google task first). Any id not yet synced in is skipped.
    private var reviewItems: [TodoItem] {
        let byId = Dictionary(allTodos.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return datedTodos.compactMap { dated in
            UUID(uuidString: dated.id).flatMap { byId[$0] }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(reviewItems) { todo in
                        ImportReviewRow(todo: todo) {
                            syncService.syncAfterAction()
                        }
                    }
                } footer: {
                    Text("Google doesn't share repeat schedules, so these came across as one-offs. Set how each dated task should repeat.")
                }
            }
            .navigationTitle("Set repeat schedules")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

/// A single dated todo with a frequency picker. Writing the recurrence persists
/// it locally and triggers a sync, matching how the edit sheet saves changes.
private struct ImportReviewRow: View {
    @Bindable var todo: TodoItem
    var onChange: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(todo.title)
                    .lineLimit(1)
                if let dueDate = todo.dueDate {
                    Text(dueDate.formatted(date: .abbreviated, time: .omitted))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            Picker("Repeat", selection: Binding(
                get: { todo.recurrence?.frequency },
                set: { newValue in
                    todo.recurrence = newValue.map { Recurrence(frequency: $0) }
                    todo.markModified()
                    onChange()
                }
            )) {
                Text("None").tag(nil as RecurrenceFrequency?)
                Text("Daily").tag(RecurrenceFrequency.daily as RecurrenceFrequency?)
                Text("Weekly").tag(RecurrenceFrequency.weekly as RecurrenceFrequency?)
                Text("Monthly").tag(RecurrenceFrequency.monthly as RecurrenceFrequency?)
                Text("Yearly").tag(RecurrenceFrequency.yearly as RecurrenceFrequency?)
            }
            .labelsHidden()
            .pickerStyle(.menu)
        }
    }
}
