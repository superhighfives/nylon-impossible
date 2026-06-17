//
//  ConversationSection.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 6/7/26.
//

import SwiftData
import SwiftUI

/// Shows the agent's clarifying questions and the user's replies, with a reply
/// box while a question is open. Replies are written locally first (so they
/// survive offline) and pushed to the server; the server's re-enrichment and
/// canonical messages arrive back via the normal sync.
struct ConversationSection: View {
    let todo: TodoItem
    let apiService: APIService?

    @Environment(\.modelContext) private var modelContext
    @State private var draft: String = ""
    @State private var isSubmitting: Bool = false

    var body: some View {
        if !todo.messages.isEmpty {
            Section {
                ForEach(todo.messages.sorted(by: { $0.createdAt < $1.createdAt })) { message in
                    let isAssistant = message.role == "assistant"
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: isAssistant ? "sparkles" : "person.fill")
                            .foregroundStyle(isAssistant ? Color.appDefault : Color.appSubtle)
                            .accessibilityLabel(isAssistant ? "Assistant" : "You")
                        Text(message.content)
                            .foregroundStyle(isAssistant ? Color.appDefault : Color.appSubtle)
                        Spacer(minLength: 0)
                    }
                    .font(.subheadline)
                }

                if todo.needsInput {
                    HStack {
                        TextField("Reply...", text: $draft)
                            .textFieldStyle(.roundedBorder)
                            .disabled(isSubmitting)
                        Button("Send") {
                            Task { await submit() }
                        }
                        .disabled(
                            draft.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting
                        )
                        Button("Dismiss") {
                            Task { await dismiss() }
                        }
                        .disabled(isSubmitting)
                    }
                }
            } header: {
                Text("Conversation")
            }
        }
    }

    private func submit() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        // Optimistic local write so the reply survives offline and shows instantly.
        let message = TodoMessage(role: "user", content: content, isSynced: false)
        message.todo = todo
        modelContext.insert(message)
        clearOpenQuestion()
        try? modelContext.save()
        draft = ""

        // Push to the server; on failure the message stays unsynced and the next
        // sync retries it via pushPendingReplies.
        guard let apiService else { return }
        do {
            _ = try await apiService.replyToTodo(
                todoId: todo.id.uuidString.lowercased(),
                content: content
            )
            message.isSynced = true
            try? modelContext.save()
        } catch {
            // Left unsynced; retried on next sync.
        }
    }

    private func dismiss() async {
        isSubmitting = true
        defer { isSubmitting = false }

        clearOpenQuestion()
        try? modelContext.save()

        guard let apiService else { return }
        // Best-effort; if it fails the next sync re-reflects server state.
        try? await apiService.dismissQuestion(todoId: todo.id.uuidString.lowercased())
    }

    private func clearOpenQuestion() {
        for message in todo.messages where message.awaitingReply {
            message.awaitingReply = false
        }
        todo.needsInput = false
    }
}
