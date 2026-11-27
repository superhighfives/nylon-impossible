//
//  TodoDetailSheet+Notes.swift
//  Nylon Impossible
//
//  The open todo's Notes.
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
        let style = Theme.Fonts.Role.notes
        let hasNotes = Self.storedNotes(notes) != nil
        let rendered = hasNotes && !editingNotes
        // From 90% of the limit, while editing, the count sits at the end
        // of the label's line, which is there either way (principle 8).
        let count = editingNotes ? NotesLimit.count(notes) : nil
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s4) {
                SectionLabel(text: "Notes")
                if let count {
                    Text(count)
                        .textStyle(Theme.Fonts.Role.label)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Colors.inkMuted)
                        // Read with the field instead.
                        .accessibilityHidden(true)
                }
            }
            ZStack(alignment: .topLeading) {
                TextField("Add notes", text: $notes, prompt: Text("Add notes").foregroundStyle(Theme.Colors.inkMuted), axis: .vertical)
                    .textStyle(style)
                    .foregroundStyle(Theme.Colors.ink)
                    .lineLimit(3...)
                    .focused($focus, equals: .notes)
                    .disabled(rendered)
                    .opacity(rendered ? 0 : 1)
                    .accessibilityHidden(rendered)
                    .onChange(of: notes) { oldValue, newValue in
                        // The field has no limit of its own: what goes past
                        // it is put back, and changes again to what fits.
                        let accepted = NotesLimit.accept(old: oldValue, new: newValue)
                        if accepted != newValue {
                            notes = accepted
                        }
                        if notesWarning.shouldWarn(for: accepted) {
                            actions.toasts.show(NotesLimit.message, action: nil)
                        }
                        guard accepted == newValue else { return }
                        let value = Self.storedNotes(newValue)
                        guard value != todo.itemNotes else { return }
                        todo.itemNotes = value
                        todo.markModified()
                        scheduleSync()
                    }
                    .accessibilityLabel("Notes")
                    .accessibilityHint(editingNotes ? NotesLimit.spokenCount(notes) ?? "" : "")
                #if os(iOS)
                // ⌘B, ⌘I and ⌘E, only while the cursor is in the notes.
                if focus == .notes { NotesShortcuts() }
                #endif
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
                    notesWarning.reset()
                }
            }
        }
    }

    func renderedNotes(style: Theme.Fonts.Style) -> some View {
        // Hidden while editing, so it isn't parsed again until you stop.
        let blocks = notesBlocks.blocks(notes, frozen: editingNotes)
        return NotesMarkdownView(blocks: blocks, style: style)
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
            // Combined into one element, the links inside can't be reached,
            // so each one is an action of its own.
            .accessibilityActions {
                ForEach(Array(NotesMarkdown.links(in: blocks).enumerated()), id: \.offset) { _, link in
                    Button("Open \(link.title)") { openURL(link.url) }
                }
            }
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
