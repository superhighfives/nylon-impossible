//
//  ContentView+Mac.swift
//  Nylon Impossible
//
//  The board's Mac window chrome: the toolbar and the window subtitle. The
//  layout itself is the iPad board (ContentView+Wide.swift) inside a
//  `NavigationSplitView`.
//

#if os(macOS)
import SwiftUI

extension ContentView {
    /// "4 todos" under the focused list's name in the title bar, with
    /// "· Syncing…" appended while a sync runs. A toolbar spinner got its own
    /// glass capsule next to the title and looked broken.
    var windowSubtitle: String {
        guard let column = focusedColumn else { return "" }
        let count = MastheadCopy.todos(rows(column).count)
        if case .syncing = syncService.state { return "\(count) · Syncing…" }
        return count
    }

    @ToolbarContentBuilder
    var macToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                run(.newTodo)
            } label: {
                Label("New todo", systemImage: Theme.Icon.add)
            }
            .help("New todo (⌘N)")

            Button {
                run(.showDone)
            } label: {
                Label("Done", systemImage: Theme.Icon.doneCircle)
            }
            .help("Show done (⇧⌘D)")
        }
    }
}
#endif
