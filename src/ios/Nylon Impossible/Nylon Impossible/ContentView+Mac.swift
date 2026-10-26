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
    /// "4 todos" under the focused list's name in the title bar.
    var windowSubtitle: String {
        guard let column = focusedColumn else { return "" }
        return MastheadCopy.todos(rows(column).count)
    }

    @ToolbarContentBuilder
    var macToolbar: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            if case .syncing = syncService.state {
                ProgressView()
                    .controlSize(.small)
                    .help("Syncing")
            }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                run(.newTodo)
            } label: {
                Label("New Todo", systemImage: Theme.Icon.add)
            }
            .help("New Todo (⌘N)")

            Button {
                run(.showDone)
            } label: {
                Label("Done", systemImage: Theme.Icon.doneCircle)
            }
            .help("Show Done (⇧⌘D)")
        }
    }
}
#endif
