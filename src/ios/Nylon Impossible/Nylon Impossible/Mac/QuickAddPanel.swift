//
//  QuickAddPanel.swift
//  Nylon Impossible
//
//  The floating quick-add the global hotkey opens over whatever app is in
//  front. `MenuBarExtra` has no API to open itself, so the hotkey shows this
//  panel instead: the same `QuickAddView`, in a non-activating panel that
//  takes the keyboard without bringing Nylon's windows forward — the way
//  Spotlight does. It closes on Escape or when it loses focus.
//

#if os(macOS)
import AppKit
import ClerkKit
import SwiftData
import SwiftUI

@MainActor
final class QuickAddPanelController: NSObject, NSWindowDelegate {
    private unowned let services: MacServices
    private var panel: QuickAddPanel?

    init(services: MacServices) {
        self.services = services
    }

    var isVisible: Bool { panel?.isVisible ?? false }

    func toggle() {
        if isVisible {
            close()
        } else {
            show()
        }
    }

    func show() {
        let panel = panel ?? makePanel()
        self.panel = panel
        position(panel)
        panel.makeKeyAndOrderFront(nil)
    }

    func close() {
        panel?.orderOut(nil)
    }

    func windowDidResignKey(_ notification: Notification) {
        close()
    }

    private func makePanel() -> QuickAddPanel {
        let root = QuickAddView(presentation: .panel) { [weak self] in self?.close() }
            .environment(services.authService)
            .environment(services.syncService)
            .environment(Clerk.shared)
            .modelContainer(services.container)
        let hosting = NSHostingView(rootView: root)
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
        panel.delegate = self
        panel.setAccessibilityTitle("Quick add")
        return panel
    }

    /// Upper third of the screen the pointer is on, like Spotlight.
    private func position(_ panel: NSPanel) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        let size = panel.frame.size
        let origin = NSPoint(
            x: frame.midX - size.width / 2,
            y: frame.minY + frame.height * 0.66 - size.height / 2
        )
        panel.setFrameOrigin(origin)
    }
}

/// A panel that can take the keyboard without activating the app.
final class QuickAddPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func cancelOperation(_ sender: Any?) {
        orderOut(nil)
    }
}
#endif
