//
//  QuickAddView+Keys.swift
//  Nylon Impossible
//
//  The popover's list from the keyboard: the cursor row, the keys
//  (`QuickAddRowCommand`) and editing a title in place.
//

#if os(macOS)
import AppKit
import SwiftUI

extension QuickAddView {
    // MARK: - Editing a title in place

    /// The title's field while it's edited, in the row's own layout.
    func titleField(_ todo: TodoItem) -> some View {
        TextField("Title", text: editingText, axis: .vertical)
            .textFieldStyle(.plain)
            .textStyle(Theme.Fonts.Role.rowTitleWide, tracking: -0.005)
            .foregroundStyle(Theme.Colors.ink)
            .lineLimit(1...3)
            .focused($editorFocused)
            .onSubmit { endEditing(save: true, keepKeyboard: true) }
            .onKeyPress(.escape) {
                endEditing(save: false, keepKeyboard: true)
                return .handled
            }
            // Clicking away (or the popover closing) keeps what you typed,
            // as every other edit does.
            .onChange(of: editorFocused) { _, focused in
                if !focused, editing?.id == todo.id { endEditing(save: true, keepKeyboard: false) }
            }
            .accessibilityLabel("Title")
    }

    /// The field's text. A title is one line, so Return never lands in it.
    var editingText: Binding<String> {
        Binding(
            get: { editing?.text ?? "" },
            set: { editing?.text = $0.filter { !$0.isNewline } }
        )
    }

    func beginEditing(_ todo: TodoItem, in shown: [TodoItem]) {
        if let at = shown.firstIndex(where: { $0.id == todo.id }) { cursorSlot = at }
        cursorId = todo.id
        editing = QuickAddTitleEdit(id: todo.id, original: todo.title)
        Task { editorFocused = true }
    }

    /// Save (or put the old title back), and return the keyboard to the row
    /// unless it went somewhere else.
    func endEditing(save: Bool, keepKeyboard: Bool) {
        guard let edit = editing else { return }
        editing = nil
        if save, let title = edit.titleToSave, let todo = todos.first(where: { $0.id == edit.id }) {
            todo.title = title
            todo.markModified()
            actions.edited()
        }
        if keepKeyboard { listFocused = true }
    }

    // MARK: - Keyboard in the list

    /// The keyboard's row: by id, else whatever now sits in its slot.
    func cursorRow(in shown: [TodoItem]) -> TodoItem? {
        guard !shown.isEmpty else { return nil }
        if let cursorId, let row = shown.first(where: { $0.id == cursorId }) { return row }
        return shown[min(cursorSlot, shown.count - 1)]
    }

    func intoList(_ shown: [TodoItem]) {
        guard let first = shown.first else { return }
        cursorId = first.id
        cursorSlot = 0
        listFocused = true
    }

    func backToField() {
        editing = nil
        listFocused = false
        cursorId = nil
        cursorSlot = 0
        focusRequested = true
    }

    func moveCursor(to index: Int, in shown: [TodoItem]) {
        let index = min(max(index, 0), shown.count - 1)
        cursorSlot = index
        cursorId = shown[index].id
    }

    func listKey(_ press: KeyPress, _ shown: [TodoItem]) -> KeyPress.Result {
        // The title field has the keys while you edit.
        guard editing == nil else { return .ignored }
        guard let todo = cursorRow(in: shown), let at = shown.firstIndex(where: { $0.id == todo.id }) else {
            backToField()
            return .handled
        }
        guard let command = QuickAddRowCommand(key: press.key, characters: press.characters, modifiers: press.modifiers) else {
            return .ignored
        }
        switch command {
        case .next:
            moveCursor(to: at + 1, in: shown)
        case .previous:
            if at == 0 { backToField() } else { moveCursor(to: at - 1, in: shown) }
        case .backToField:
            backToField()
        case .edit:
            beginEditing(todo, in: shown)
        case .openOnWeb:
            QuickAddHandoff.openOnWeb(todo.id, open: { openURL($0) }, dismiss: onDismiss)
        case .done:
            // Stay in the slot: the next todo moves up into it.
            cursorSlot = at
            cursorId = nil
            actions.toggleDone(todo)
        case .openLink:
            let first = todo.urls.sorted { $0.position < $1.position }.first?.url ?? todo.pendingUrls.first
            if let first, let url = URL(string: first) {
                openURL(url)
            } else {
                actions.toasts.show("No link on this todo", action: nil)
            }
        }
        return .handled
    }
}
#endif
