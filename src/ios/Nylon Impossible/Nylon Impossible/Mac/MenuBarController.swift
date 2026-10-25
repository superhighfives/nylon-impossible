//
//  MenuBarController.swift
//  Nylon Impossible
//
//  The menu bar icon, as a plain `NSStatusItem`, and the quick add it opens
//  in a panel under it.
//
//  This used to be a SwiftUI `MenuBarExtra`. That re-applies its label image
//  to the status button on every scene update — and the board window updates
//  the scenes many times a second — and each `setImage:` asks the status bar
//  window for another constraints pass. That window allows about as many
//  passes as it has views (six), so a busy board ran it out and AppKit threw
//  "more Update Constraints in Window passes than there are views in the
//  window", killing the app (Sentry NYLON-IMPOSSIBLE-APPLE-F). Setting the
//  image once, here, takes the status bar out of SwiftUI's update loop.
//

#if os(macOS)
import AppKit
import SwiftUI

@MainActor
final class MenuBarController: NSObject, NSWindowDelegate {
    private unowned let services: MacServices
    private var item: NSStatusItem?
    private var panel: QuickAddPanel?

    init(services: MacServices) {
        self.services = services
    }

    /// Show or hide the icon as the Settings toggle changes.
    func start() {
        withObservationTracking {
            _ = services.settings.showsMenuBarIcon
        } onChange: { [weak self] in
            Task { @MainActor in self?.start() }
        }
        apply(services.settings.showsMenuBarIcon)
    }

    private func apply(_ shows: Bool) {
        if shows, item == nil {
            item = makeItem()
        } else if !shows, let item {
            close()
            NSStatusBar.system.removeStatusItem(item)
            self.item = nil
        }
    }

    private func makeItem() -> NSStatusItem {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = item.button {
            let image = NSImage(named: "MenuBarIcon")
            image?.isTemplate = true
            button.image = image
            button.setAccessibilityLabel("Nylon")
            button.target = self
            button.action = #selector(toggle)
        }
        return item
    }

    @objc private func toggle() {
        if panel?.isVisible == true {
            close()
        } else {
            show()
        }
    }

    private func show() {
        guard let button = item?.button, let buttonWindow = button.window else { return }
        let panel = panel ?? makePanel()
        self.panel = panel
        item?.button?.highlight(true)
        // Under the icon, kept on the icon's screen.
        let anchor = buttonWindow.convertToScreen(button.convert(button.bounds, to: nil))
        let size = panel.frame.size
        var origin = NSPoint(x: anchor.midX - size.width / 2, y: anchor.minY - size.height - 4)
        if let screen = buttonWindow.screen?.visibleFrame {
            origin.x = min(max(origin.x, screen.minX + 8), screen.maxX - size.width - 8)
        }
        panel.setFrameOrigin(origin)
        panel.makeKeyAndOrderFront(nil)
    }

    private func close() {
        panel?.orderOut(nil)
        item?.button?.highlight(false)
    }

    func windowDidResignKey(_ notification: Notification) {
        // A click on the icon itself resigns key first; leave that to toggle(),
        // or it would close here and reopen there.
        if let event = NSApp.currentEvent, event.window === item?.button?.window { return }
        close()
    }

    private func makePanel() -> QuickAddPanel {
        let root = MacMenuBarRoot { [weak self] in self?.close() }
        let panel = QuickAddPanel.make(content: NSHostingView(rootView: root))
        panel.isMovableByWindowBackground = false
        panel.delegate = self
        panel.setAccessibilityTitle("Nylon")
        return panel
    }
}
#endif
