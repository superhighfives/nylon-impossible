//
//  ContentView+Mac.swift
//  Nylon Impossible
//
//  The board's Mac window chrome: the toolbar and the window subtitle. The
//  layout itself is the iPad board (ContentView+Wide.swift) inside a
//  `NavigationSplitView`.
//

#if os(macOS)
import AppKit
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
extension View {
    /// The window toolbar drawn in the board's canvas, always, with the
    /// system's line under it hidden.
    @ViewBuilder
    func canvasWindowToolbar() -> some View {
        let toolbar = toolbarBackground(Theme.Colors.canvas, for: .windowToolbar)
            .background(TitlebarSeparatorHidden())
        if #available(macOS 15, *) {
            toolbar.toolbarBackgroundVisibility(.visible, for: .windowToolbar)
        } else {
            toolbar.toolbarBackground(.visible, for: .windowToolbar)
        }
    }
}

/// Hides the system's line under the window toolbar, in this window and every
/// new one, so the board's own hairline is the only one there. The window's
/// style overrides the split view items' own. Watched rather than set once:
/// if SwiftUI or AppKit sets a style again on a later layout (a sidebar
/// toggle, #601), it goes straight back to none.
struct TitlebarSeparatorHidden: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { WindowView() }
    func updateNSView(_ nsView: NSView, context: Context) {}

    final class WindowView: NSView {
        private var separatorObservation: NSKeyValueObservation?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            separatorObservation = window?.observe(\.titlebarSeparatorStyle, options: [.initial]) { window, _ in
                MainActor.assumeIsolated {
                    if window.titlebarSeparatorStyle != .none {
                        window.titlebarSeparatorStyle = .none
                    }
                }
            }
        }
    }
}
#endif
