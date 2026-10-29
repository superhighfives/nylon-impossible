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

    /// New todo (quick add) and New list, in place of New todo and Done:
    /// Done is the board's fourth column now.
    @ToolbarContentBuilder
    var macToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                palette = .all
            } label: {
                Label("Search and commands", systemImage: "magnifyingglass")
            }
            .help("Search and commands (⌘K)")

            Button {
                showsQuickAdd = true
            } label: {
                Label("New todo", systemImage: Theme.Icon.add)
            }
            .help("New todo (⌘N)")
            .popover(isPresented: $showsQuickAdd, arrowEdge: .bottom) { quickAdd }

            Button {
                newListAnchor = .toolbar
            } label: {
                Label("New list", systemImage: Theme.Icon.newList)
            }
            .help("New list (⇧⌘N)")
            .popover(isPresented: newListPopoverBinding, arrowEdge: .bottom) { newListForm }
        }
    }
}
#endif
