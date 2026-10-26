//
//  ContentView+Panel.swift
//  Nylon Impossible
//
//  The board's trailing panel, what it offers the menu bar, and drops from
//  other apps. Split from ContentView+Wide.swift; shared by the iPad and the
//  Mac.
//

import SwiftUI

private struct PanelTodoState: Equatable {
    let id: UUID?
    let done: Bool
}

extension ContentView {
    // MARK: - Panel

    /// The board with the detail, Done or Settings in an inspector.
    ///
    /// Everything the panel shows is read out here, in the board's own update,
    /// and handed in as values: on macOS the inspector is a separate hosting
    /// view with its own view graph (see `ContentRoot`).
    var boardWithPanel: some View {
        let lists = orderedLists
        let todo = detailTodo
        let route = widePanel
        let showsCalendar = showsDueCalendar
        let apiService = syncService.apiService
        let userId = authService.userId
        let actions = actions
        return board
            .inspector(isPresented: panelBinding) {
                WidePanel(
                    todo: todo,
                    route: route,
                    lists: lists,
                    actions: actions,
                    apiService: apiService,
                    userId: userId,
                    showsCalendar: showsCalendar,
                    onClose: closePanel
                )
                .overlay(alignment: .leading) { VerticalHairline() }
                .inspectorColumnWidth(min: 340, ideal: Theme.Wide.panelWidth, max: 520)
            }
            // Checking off the todo the panel is showing puts the panel away,
            // as the row leaving the board would. Opening one that's already
            // done (Show Done) changes the id too, so it stays.
            .onChange(of: PanelTodoState(id: todo?.id, done: todo?.isEffectivelyCompleted ?? false)) { old, new in
                if new.done, !old.done, old.id == new.id { closePanel() }
            }
    }

    var panelBinding: Binding<Bool> {
        Binding(
            get: { detailTodo != nil || widePanel != nil },
            set: { if !$0 { closePanel() } }
        )
    }

    // MARK: - Menus

    /// What the board offers the menus: its keys, whether a row is selected,
    /// and your lists for Move to.
    var commandHandler: BoardCommandHandler {
        BoardCommandHandler(
            keysEnabled: keyboardEnabled,
            hasSelection: selectedTodoId.map { id in todos.contains { $0.id == id } } ?? false,
            collections: collections.map { (id: $0.id, name: $0.name) },
            focusedListName: focusedColumn?.name,
            perform: { perform($0) },
            run: { run($0) }
        )
    }

    // MARK: - Drops from other apps

    /// Text or a link dropped on a column from another app: added there the
    /// way the composer would, a todo per line, with typed dates read.
    func addDropped(_ text: String, to list: TodoListModel) {
        let created = actions.add(draft: text, to: list.id, parseDates: true, userId: authService.userId)
        noteAdded(created, to: list.id)
        guard !created.isEmpty else { return }
        actions.toasts.show(created.count > 1 ? "\(created.count) added to \(list.name)" : "Added to \(list.name)", action: nil)
    }
}
