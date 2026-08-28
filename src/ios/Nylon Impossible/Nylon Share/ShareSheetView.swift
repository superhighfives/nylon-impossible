//
//  ShareSheetView.swift
//  Nylon Share
//
//  Created by Charlie Gleason on 3/4/26.
//

import SwiftUI

struct ShareSheetView: View {
    let content: String
    let isURL: Bool
    let onSave: (String) -> Void
    let onCancel: () -> Void

    @State private var taskTitle: String = ""
    /// The title saved when the field is left empty, shown greyed out inside it.
    /// nil for shared text, which is the task itself and so starts *in* the
    /// field rather than behind it — there's nothing else it could fall back to.
    private let emptyFallback: String?
    /// Whether `emptyFallback` is the "Check {domain}" title we generated
    /// ourselves — nothing was supplied by the sharing app, so the server is
    /// what will eventually name this todo properly.
    private let fallbackIsGenerated: Bool
    @FocusState private var isFocused: Bool

    /// Whether saving right now would write the title we generated. Tracks the
    /// live `taskTitle` rather than being settled at init: the moment the user
    /// types their own title the server stops rewriting it (per
    /// `isPlaceholderTitle` on the API side), so the promise below has to stop
    /// with it — and come back if they undo the edit.
    private var willUseGeneratedTitle: Bool {
        fallbackIsGenerated
            && taskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// What Save writes — the typed title, or the fallback behind it.
    private var savedTitle: String {
        TaskCreationService.shareSheetTitle(typed: taskTitle, fallback: emptyFallback ?? "")
    }

    init(content: String, isURL: Bool, prefilledTitle: String? = nil, onSave: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.content = content
        self.isURL = isURL
        self.onSave = onSave
        self.onCancel = onCancel
        // Use the app-provided title (e.g. article title from Reeder) when available;
        // otherwise fall back to generating a title from the URL.
        // A share extension has no network of its own, so the URL-derived title
        // is a placeholder: the server replaces it with the page's real title
        // (or a tweet's opening line) once it fetches the link on the next sync.
        let trimmed = prefilledTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let supplied = trimmed?.isEmpty == false ? trimmed : nil
        // A shared link starts with an empty field and its fallback greyed out
        // behind it, so a title can be typed straight in instead of selecting
        // and deleting one first. Shared text stays in the field to be edited.
        emptyFallback = isURL ? (supplied ?? TaskCreationService.titleFromURL(content)) : nil
        fallbackIsGenerated = isURL && supplied == nil
        _taskTitle = State(initialValue: isURL ? "" : content)
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Task")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    
                    TextField(emptyFallback ?? "Task title", text: $taskTitle, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .focused($isFocused)
                        .lineLimit(3...6)
                }
                .padding(.horizontal)

                if willUseGeneratedTitle {
                    Text("Leave this empty and Nylon will title the task from the link once it fetches it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)
                }

                if isURL {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("URL")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        
                        Text(content)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                }
                
                Spacer()
            }
            .padding(.top)
            .navigationTitle("Add to Nylon")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(savedTitle)
                    }
                    .fontWeight(.semibold)
                    .disabled(savedTitle.isEmpty)
                }
            }
        }
        .onAppear {
            isFocused = true
        }
    }
}

#Preview {
    ShareSheetView(
        content: "https://example.com/article",
        isURL: true,
        onSave: { _ in },
        onCancel: { }
    )
}
