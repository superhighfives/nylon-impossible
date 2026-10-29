//
//  MacCommands.swift
//  Nylon Impossible
//
//  The Mac menu bar. File: New Todo ⌘N and New List ⇧⌘N (in place of New
//  Window). View: Today ⌘1, This week ⌘2, Someday ⌘3, Show Done ⇧⌘D, and
//  the sidebar toggle. Todo: the board's single-key map as menu items —
//  their keys are only bound while no text field is focused — plus Move to.
//  Edit keeps the system's items; ⌘Z reaches the toast's Undo through the
//  window's undo manager (see `ToastUndoBridge`). Help opens the site and,
//  for an admin, Send Feedback… ⇧⌘F (see FeedbackPresentation.swift).
//
//  Titles, keys and routing come from `BoardMenuCommand`.
//

#if os(macOS)
import SwiftUI

struct MacCommands: Commands {
    @FocusedValue(\.board) private var board

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            item(.newTodo)
            item(.newList)
        }

        SidebarCommands()
        InspectorCommands()
        CommandGroup(before: .sidebar) {
            ForEach(BoardMenuCommand.viewMenu, id: \.self) { item($0) }
            item(.showDone)
            Divider()
        }

        CommandMenu("Todo") {
            ForEach(Array(BoardMenuCommand.todoMenu.enumerated()), id: \.offset) { _, command in
                if let command {
                    item(command)
                } else {
                    Divider()
                }
            }
            Divider()
            Menu("Move to") {
                ForEach(BoardMenuCommand.moveMenu, id: \.self) { item($0, title: $0.submenuTitle) }
                if let collections = board?.collections, !collections.isEmpty {
                    Divider()
                    ForEach(collections, id: \.id) { list in
                        Button(list.name) { board?.handle(.moveToList(list.id)) }
                            .disabled(!BoardMenuCommand.moveToList(list.id).isEnabled(in: board))
                    }
                }
            }
            .disabled(board?.hasSelection != true)
        }

        CommandGroup(replacing: .help) {
            Link("Nylon help", destination: URL(string: "https://nylonimpossible.com")!)
            // Admin only: files an issue in the private feedback repo.
            if MacServices.shared.preferencesService.isAdmin {
                Divider()
                Button("Send feedback…") {
                    MacServices.shared.showMainWindow()
                    MacServices.shared.feedbackService.presentWithSnapshot()
                }
                .keyboardShortcut(FeedbackService.shortcut.key, modifiers: FeedbackService.shortcut.modifiers)
            }
        }
    }

    /// A menu item for `command`. Single-key shortcuts are only attached while
    /// the board has the keyboard; the item itself stays, so the menu
    /// doesn't change shape as you type.
    @ViewBuilder
    private func item(_ command: BoardMenuCommand, title: String? = nil) -> some View {
        let button = Button(title ?? command.title) { board?.handle(command) }
            .disabled(!command.isEnabled(in: board))
        if let shortcut = command.shortcut, !command.isSingleKey || board?.keysEnabled == true {
            button.keyboardShortcut(shortcut.key, modifiers: shortcut.modifiers)
        } else {
            button
        }
    }
}
#endif
