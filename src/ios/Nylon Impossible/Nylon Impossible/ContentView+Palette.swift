//
//  ContentView+Palette.swift
//  Nylon Impossible
//
//  What the palette shows, the Keyboard shortcuts sheet and the G hint, all
//  read from `BoardMenuCommand` so they list the same commands with the same
//  keys as the menus.
//

import SwiftUI

extension ContentView {
    // MARK: - Palette

    /// The todo Move to (M) is moving, if it's still open.
    var movingTodo: TodoItem? {
        guard case .move(let id) = palette else { return nil }
        return todos.first { $0.id == id && !$0.isCompleted }
    }

    var paletteTitle: String? {
        switch palette {
        case .move: return movingTodo.map { "Move “\($0.title)”" }
        case .lists: return "Go to a list"
        default: return nil
        }
    }

    var palettePlaceholder: String {
        switch palette {
        case .move: return "Move to a list…"
        case .lists: return "Go to a list…"
        default: return "Search todos, lists and commands…"
        }
    }

    /// Go to: the time lists, your lists and Done, with counts and ⇧ keys.
    private var goToItems: [PaletteItem] {
        let counts = counts
        let time = timeColumns.map { list in
            PaletteItem(
                id: "go:\(list.id)", label: list.name,
                meta: "\(counts[list.id.lowercased()] ?? 0)",
                hint: list.systemKind.map { BoardMenuCommand.key(.jump(.time($0))).shortcut.map(BoardMenuCommand.label) } ?? nil,
                run: { focusColumn(list.id) }
            )
        }
        let yours = collections.enumerated().map { index, list in
            PaletteItem(
                id: "go:\(list.id)", label: list.name,
                meta: "\(counts[list.id.lowercased()] ?? 0)",
                hint: BoardKey.jump(.list(index)).menuShortcut.map(BoardMenuCommand.label),
                run: { openCollection(list) }
            )
        }
        let done = PaletteItem(
            id: "go:done", label: "Done", meta: "\(doneCount)",
            hint: BoardKey.jump(.done).menuShortcut.map(BoardMenuCommand.label),
            run: { jump(.done) }
        )
        return time + yours + [done]
    }

    /// Commands: New todo, New list, Keyboard shortcuts, and what the
    /// selection can do.
    private var commandItems: [PaletteItem] {
        func item(_ command: BoardMenuCommand, _ label: String) -> PaletteItem {
            PaletteItem(id: "cmd:\(label)", label: label, hint: command.keyLabel) { run(command) }
        }
        var items = [
            item(.key(.new), "New todo"),
            item(.key(.newList), "New list"),
            item(.key(.shortcuts), "Keyboard shortcuts")
        ]
        if let id = selectedTodoId, let todo = todos.first(where: { $0.id == id && !$0.isCompleted }) {
            items += [
                item(.key(.moveTo), "Move “\(todo.title)” to…"),
                item(.key(.done), "Mark “\(todo.title)” done"),
                item(.key(.pin), "\(todo.pinned ? "Unpin" : "Pin") “\(todo.title)”")
            ]
            if !todo.urls.isEmpty || !todo.pendingUrls.isEmpty {
                items.append(item(.key(.openLink), "Open “\(todo.title)”’s link"))
            }
        }
        return items
    }

    /// Todos: up to eight whose titles match, Done included. Choosing one
    /// goes to its column (opening your list if need be) and selects it.
    private func todoItems(_ query: String) -> [PaletteItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        let hidden = actions.pendingListDeletes
        return todos
            .filter {
                $0.parentId == nil && !$0.isSoftDeleted && !actions.pendingDeletes.contains($0.id)
                    && !hidden.contains($0.listKey ?? "") && $0.title.localizedCaseInsensitiveContains(q)
            }
            .prefix(8)
            .map { todo in
                let list = orderedLists.first { $0.id.lowercased() == todo.listKey?.lowercased() }
                return PaletteItem(
                    id: "todo:\(todo.id)", label: todo.title,
                    meta: todo.isCompleted ? "Done" : list?.name,
                    run: { goTo(todo) }
                )
            }
    }

    func goTo(_ todo: TodoItem) {
        if todo.isCompleted {
            jump(.done, rowId: todo.id)
        } else if let index = collections.firstIndex(where: { $0.id.lowercased() == todo.listKey?.lowercased() }) {
            jump(.list(index), rowId: todo.id)
        } else if let list = timeColumns.first(where: { $0.id.lowercased() == todo.listKey?.lowercased() }) {
            focusColumn(list.id)
            selectedTodoId = todo.id
        }
    }

    /// Move to: every list but the todo's own, with 1/2/3 for the time
    /// lists, and New list "…" when what's typed matches none.
    private func moveItems(_ todo: TodoItem, _ query: String) -> [PaletteItem] {
        let q = query.trimmingCharacters(in: .whitespaces)
        let counts = counts
        var items = orderedLists
            .filter { $0.id.lowercased() != todo.listKey?.lowercased() }
            .filter { q.isEmpty || $0.name.localizedCaseInsensitiveContains(q) }
            .map { list in
                PaletteItem(
                    id: "move:\(list.id)", label: list.name,
                    meta: "\(counts[list.id.lowercased()] ?? 0)",
                    hint: list.systemKind.map { BoardMenuCommand.key(.move($0)).keyLabel },
                    run: { moveSelected(todo, to: list.id) }
                )
            }
        let name = q.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        if !name.isEmpty, !orderedLists.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
            items.append(PaletteItem(id: "move:new", label: "New list “\(name)”") { moveToNewList(todo, name: name) })
        }
        return items
    }

    func paletteGroups(_ query: String) -> [PaletteGroup] {
        switch palette {
        case .lists:
            let q = query.trimmingCharacters(in: .whitespaces)
            return [PaletteGroup(title: "Lists", items: goToItems.filter { q.isEmpty || $0.label.localizedCaseInsensitiveContains(q) })]
        case .move:
            guard let todo = movingTodo else { return [] }
            return [PaletteGroup(title: "Move to", items: moveItems(todo, query))]
        default:
            let q = query.trimmingCharacters(in: .whitespaces)
            func matching(_ items: [PaletteItem]) -> [PaletteItem] {
                q.isEmpty ? items : items.filter { $0.label.localizedCaseInsensitiveContains(q) }
            }
            return [
                PaletteGroup(title: "Todos", items: todoItems(query)),
                PaletteGroup(title: "Go to", items: matching(goToItems)),
                PaletteGroup(title: "Commands", items: matching(commandItems))
            ]
        }
    }

    /// Moving from the palette hands the selection on, as 1/2/3 do.
    private func moveSelected(_ todo: TodoItem, to listId: String) {
        if selectedTodoId == todo.id, let column = selectionColumn {
            selectedTodoId = BoardNavigator.neighbor(of: todo.id, in: keyRows(column))
        }
        actions.move(todo, toList: listId)
    }

    /// New list "…": create it, then move the todo into it.
    private func moveToNewList(_ todo: TodoItem, name: String) {
        Task {
            guard await createList(name), let id = viewModel.openCollectionId else { return }
            moveSelected(todo, to: id)
        }
    }

    // MARK: - Overlays

    /// The palette is up (Move to only while its todo is still open).
    var showsPalette: Bool {
        switch palette {
        case .none: return false
        case .move: return movingTodo != nil
        default: return true
        }
    }

    /// Esc on the board, as a key command: iPadOS takes hardware Esc before
    /// `onKeyPress` sees it, but routes it to a key command. It backs out one
    /// step: the palette, a rename, typing in a column, the open todo, then
    /// to the sidebar. A presented popover has its own Esc (its responder
    /// chain doesn't reach this one).
    func escape() {
        if palette != nil {
            palette = nil
            boardFocused = true
        } else if renamingColumnId != nil {
            renamingColumnId = nil
            boardFocused = true
        } else if editingColumnId != nil {
            editingColumnId = nil
            boardFocused = true
        } else {
            perform(.back)
        }
    }

    /// The palette, the Keyboard shortcuts sheet and the G hint, over the
    /// whole board.
    func boardOverlays<Content: View>(_ content: Content) -> some View {
        content
            .background {
                EscapeKey(action: escape)
            }
            .overlay {
                if showsPalette {
                    BoardPalette(
                        title: paletteTitle,
                        placeholder: palettePlaceholder,
                        groups: paletteGroups,
                        onClose: {
                            palette = nil
                            boardFocused = true
                        }
                    )
                    .id(palette.map(String.init(describing:)))
                    .transition(.opacity)
                }
            }
            .overlay(alignment: .bottom) {
                if goPending { GoHint().padding(.bottom, Theme.Space.s6).transition(.opacity) }
            }
            // Closing quick add or New list hands the keyboard back.
            .onChange(of: showsQuickAdd) { _, shown in if !shown { boardFocused = true } }
            .onChange(of: newListAnchor) { _, anchor in if anchor == nil { boardFocused = true } }
            .onChange(of: showsShortcuts) { _, shown in if !shown { boardFocused = true } }
            .sheet(isPresented: $showsShortcuts) {
                KeyboardShortcutsView(showsFeedback: showsFeedback) { showsShortcuts = false }
            }
    }
}

/// An invisible button that binds Esc as a key command, so iPadOS hands it
/// over (it never reaches `onKeyPress`). Out of sight and of VoiceOver.
struct EscapeKey: View {
    let action: () -> Void

    var body: some View {
        Button("", action: action)
            .keyboardShortcut(.escape, modifiers: [])
            .opacity(0)
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
    }
}

/// The card after G, until the next key or 1.2 seconds.
struct GoHint: View {
    private static let keys = [("G", "Go to"), ("T", "Today"), ("W", "This week"), ("S", "Someday"), ("D", "Done"), ("L", "Lists")]

    var body: some View {
        HStack(spacing: 12) {
            ForEach(Self.keys, id: \.0) { key, label in
                HStack(spacing: 6) {
                    KeyCap(key)
                    Text(label)
                }
            }
        }
        .textStyle(Theme.Fonts.Role.meta)
        .foregroundStyle(Theme.Colors.inkMuted)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.Colors.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.Colors.hairline))
        .shadow(color: .black.opacity(0.14), radius: 15, y: 10)
        .accessibilityElement(children: .combine)
    }
}

struct KeyCap: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .textStyle(Theme.Fonts.Role.meta)
            .fontWeight(.medium)
            .foregroundStyle(Theme.Colors.ink)
            .padding(.horizontal, 6)
            .frame(minWidth: 24, minHeight: 24)
            .background(Theme.Colors.canvas, in: RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous).strokeBorder(Theme.Colors.hairline))
    }
}

/// `?`: the board's keys, from `BoardMenuCommand.shortcutSections`.
struct KeyboardShortcutsView: View {
    var showsFeedback = false
    let onClose: () -> Void

    var body: some View {
        PanelChrome(onClose: onClose) {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.s4) {
                    Text("Keyboard shortcuts")
                        .textStyle(Theme.Fonts.Wide.title)
                        .foregroundStyle(Theme.Colors.ink)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(BoardMenuCommand.shortcutSections, id: \.title) { section in
                        VStack(alignment: .leading, spacing: 6) {
                            SectionLabel(text: section.title)
                            ForEach(section.commands, id: \.self) { command in
                                HStack {
                                    Text(command.title)
                                        .foregroundStyle(Theme.Colors.ink)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    Text(command.keyLabel)
                                        .foregroundStyle(Theme.Colors.inkMuted)
                                }
                                .textStyle(Theme.Fonts.Role.bodyWide)
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                }
                .padding(Theme.Wide.gutter)
            }
        }
        .frame(minWidth: 420, minHeight: 520)
        .presentationBackground(Theme.Colors.canvas)
    }
}
