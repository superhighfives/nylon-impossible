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
    /// Whether the title is still the "Check {domain}" placeholder we generated
    /// rather than one the sharing app supplied or the user typed. Only a
    /// placeholder gets replaced server-side once the link is fetched, so this
    /// is what decides whether to promise that.
    private let titleIsPlaceholder: Bool
    @FocusState private var isFocused: Bool

    init(content: String, isURL: Bool, prefilledTitle: String? = nil, onSave: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.content = content
        self.isURL = isURL
        self.onSave = onSave
        self.onCancel = onCancel
        // Use the app-provided title (e.g. article title from Reeder) when available;
        // otherwise fall back to generating a title from the URL or using the text directly.
        // A share extension has no network of its own, so the URL-derived title
        // is a placeholder: the server replaces it with the page's real title
        // (or a tweet's opening line) once it fetches the link on the next sync.
        let defaultTitle = isURL ? TaskCreationService.titleFromURL(content) : content
        let trimmed = prefilledTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let supplied = trimmed?.isEmpty == false ? trimmed : nil
        titleIsPlaceholder = isURL && supplied == nil
        _taskTitle = State(initialValue: supplied ?? defaultTitle)
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Task")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    
                    TextField("Task title", text: $taskTitle, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .focused($isFocused)
                        .lineLimit(3...6)
                }
                .padding(.horizontal)
                
                if titleIsPlaceholder {
                    Text("Leave this as-is and Nylon will title the task from the link once it fetches it.")
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
                        onSave(taskTitle)
                    }
                    .fontWeight(.semibold)
                    .disabled(taskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
