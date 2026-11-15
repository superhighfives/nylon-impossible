//
//  TodoDetailSheet+Notes.swift
//  Nylon Impossible
//
//  The open todo's Notes, in the sheet and the board's fourth column alike.
//

import SwiftUI

extension TodoDetailSheet {
    /// Notes drawn as Markdown while you aren't editing them, the plain text
    /// you typed while you are. A tap or click (anywhere but a link), or
    /// Return when the keyboard is on them, edits; leaving the field draws
    /// them again. Both sit in one place at the same type and size, so the
    /// switch moves nothing but the text (principle 8). Empty notes are
    /// always the editor, with its "Add notes" placeholder.
    var notesField: some View {
        let style = isColumn ? Theme.Fonts.Role.bodyWide : Theme.Fonts.Role.body
        let hasNotes = Self.storedNotes(notes) != nil
        let rendered = hasNotes && !editingNotes
        return VStack(alignment: .leading, spacing: isColumn ? Theme.Space.s1 : 6) {
            SectionLabel(text: "Notes")
            ZStack(alignment: .topLeading) {
                TextField("Add notes", text: $notes, prompt: Text("Add notes").foregroundStyle(Theme.Colors.inkMuted), axis: .vertical)
                    .textStyle(style)
                    .foregroundStyle(Theme.Colors.ink)
                    .lineLimit(isColumn ? 2... : 3...)
                    .focused($focus, equals: .notes)
                    .disabled(rendered)
                    .opacity(rendered ? 0 : 1)
                    .accessibilityHidden(rendered)
                    .onChange(of: notes) { _, newValue in
                        let value = Self.storedNotes(newValue)
                        guard value != todo.itemNotes else { return }
                        todo.itemNotes = value
                        todo.markModified()
                        scheduleSync()
                    }
                    .accessibilityLabel("Notes")
                if hasNotes {
                    renderedNotes(style: style)
                        .opacity(rendered ? 1 : 0)
                        .allowsHitTesting(rendered)
                        .accessibilityHidden(!rendered)
                }
            }
            .onChange(of: focus) { old, new in
                if new == .notes {
                    editingNotes = true
                } else if old == .notes {
                    editingNotes = false
                }
            }
        }
    }

    func renderedNotes(style: Theme.Fonts.Style) -> some View {
        NotesMarkdownView(blocks: NotesMarkdown.blocks(notes), style: style)
            .contentShape(Rectangle())
            .background {
                if focus == .notesShown {
                    RoundedRectangle(cornerRadius: Theme.Radius.chip)
                        .fill(Theme.Colors.fill)
                        .padding(-Theme.Space.s1)
                }
            }
            .environment(\.openURL, OpenURLAction { _ in
                linkOpenedAt = Date()
                return .systemAction
            })
            .onTapGesture { editNotesUnlessLinkOpened() }
            // Reached with Tab like the field it stands for; Return edits.
            .focusable(interactions: .edit)
            .focused($focus, equals: .notesShown)
            .focusEffectDisabled()
            .onKeyPress(.return) {
                editNotes()
                return .handled
            }
            .accessibilityElement(children: .combine)
            .accessibilityHint("Edits the notes")
            .accessibilityAction { editNotes() }
    }

    /// A tap that opened a link doesn't also start editing.
    func editNotesUnlessLinkOpened() {
        Task { @MainActor in
            if let linkOpenedAt, Date().timeIntervalSince(linkOpenedAt) < 0.5 { return }
            editNotes()
        }
    }

    /// The editor in place of the drawn notes, with the cursor in it. The
    /// field is enabled first and focused on the next turn, since a
    /// disabled field can't take the cursor.
    func editNotes() {
        editingNotes = true
        Task { @MainActor in focus = .notes }
    }

    /// What the notes field stores: exactly what was typed, or nothing when
    /// that's only whitespace. Never the drawn text.
    static func storedNotes(_ typed: String) -> String? {
        typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : typed
    }
}
