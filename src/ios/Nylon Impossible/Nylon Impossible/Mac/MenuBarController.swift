//
//  MenuBarController.swift
//  Nylon Impossible
//
//  The menu bar icon, as a plain `NSStatusItem`, and the popover it opens
//  under itself: quick add over today's todos, which is the whole Mac app.
//  The icon is always there, since it's the only way in; the global hotkey
//  opens the same popover.
//
//  This used to be a SwiftUI `MenuBarExtra`. That re-applies its label image
//  to the status button on every scene update — and the old board window
//  updated the scenes many times a second — and each `setImage:` asks the status bar
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

    /// Put the icon in the menu bar. Called once, at launch.
    func start() {
        guard item == nil else { return }
        item = makeItem()
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

    @objc func toggle() {
        if panel?.isVisible == true {
            close()
        } else {
            show()
        }
    }

    func show() {
        guard let anchor else { return }
        let panel = panel ?? makePanel()
        self.panel = panel
        item?.button?.highlight(true)
        panel.setFrameOrigin(MacWindowPlacement.origin(for: panel.frame.size, under: anchor.icon, in: anchor.screen))
        panel.makeKeyAndOrderFront(nil)
    }

    /// Put `window` where the popover opens, under the icon. Without an icon
    /// (a screenshot run, a test), in the middle of the screen.
    func place(_ window: NSWindow) {
        guard let anchor else {
            window.center()
            return
        }
        window.setFrameOrigin(MacWindowPlacement.origin(for: window.frame.size, under: anchor.icon, in: anchor.screen))
    }

    /// The icon's frame on screen, and its screen's visible frame.
    var anchor: (icon: CGRect, screen: CGRect?)? {
        guard let button = item?.button, let buttonWindow = button.window else { return nil }
        let icon = buttonWindow.convertToScreen(button.convert(button.bounds, to: nil))
        return (icon, buttonWindow.screen?.visibleFrame)
    }

    func close() {
        panel?.orderOut(nil)
        item?.button?.highlight(false)
    }

    /// Send feedback…: snapshot the popover as it is, close it, open the form.
    func sendFeedback() {
        MacFeedbackHandoff.send(
            snapshot: { MacFeedbackSnapshot.of(panel) },
            close: close,
            open: services.showFeedback
        )
    }

    func windowDidResignKey(_ notification: Notification) {
        // A click on the icon itself resigns key first; leave that to toggle(),
        // or it would close here and reopen there.
        if let event = NSApp.currentEvent, event.window === item?.button?.window { return }
        close()
    }

    private func makePanel() -> QuickAddPanel {
        let root = MacMenuBarRoot(
            onDismiss: { [weak self] in self?.close() },
            onFeedback: { [weak self] in self?.sendFeedback() }
        )
        let panel = QuickAddPanel.make(content: NSHostingView(rootView: root))
        panel.isMovableByWindowBackground = false
        panel.delegate = self
        panel.setAccessibilityTitle("Nylon")
        return panel
    }
}

/// Where the popover opens, and the windows it opens (Send feedback…,
/// Settings…, Sign in): under the menu bar icon, kept on the icon's screen.
/// Opened in the middle of the screen, a window looked unrelated to the menu
/// bar it came from (#788).
enum MacWindowPlacement {
    /// The gap between the menu bar and what opens under it.
    static let gap: CGFloat = 4
    /// How far in from the screen's edges it stays.
    static let margin: CGFloat = 8

    /// The origin of a window of `size` centred under `icon`, both in screen
    /// coordinates, kept inside `screen` (the visible frame) when there is one.
    static func origin(for size: CGSize, under icon: CGRect, in screen: CGRect?) -> CGPoint {
        var origin = CGPoint(x: icon.midX - size.width / 2, y: icon.minY - size.height - gap)
        if let screen {
            origin.x = min(max(origin.x, screen.minX + margin), screen.maxX - size.width - margin)
            origin.y = max(origin.y, screen.minY + margin)
        }
        return origin
    }
}
#endif
