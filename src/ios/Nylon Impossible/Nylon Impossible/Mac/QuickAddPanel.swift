//
//  QuickAddPanel.swift
//  Nylon Impossible
//
//  The menu bar popover's window: `QuickAddView` in a non-activating panel
//  that takes the keyboard without bringing the app forward, over whatever
//  app is in front. It closes on Escape or when it loses focus. The menu bar
//  icon and the global hotkey both open it, under the icon
//  (`MenuBarController`).
//

#if os(macOS)
import AppKit
import SwiftUI

/// A panel that can take the keyboard without activating the app.
final class QuickAddPanel: NSPanel {
    /// A floating, borderless-looking panel sized to `content`.
    static func make(content hosting: NSHostingView<some View>) -> QuickAddPanel {
        hosting.sizingOptions = [.preferredContentSize]
        let panel = QuickAddPanel(
            contentRect: NSRect(x: 0, y: 0, width: QuickAddView.width, height: 320),
            styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView],
            backing: .buffered,
            defer: true
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.contentView = hosting
        return panel
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func cancelOperation(_ sender: Any?) {
        orderOut(nil)
    }
}
#endif
