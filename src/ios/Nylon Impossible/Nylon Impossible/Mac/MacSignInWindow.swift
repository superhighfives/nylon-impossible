//
//  MacSignInWindow.swift
//  Nylon Impossible
//
//  The sign-in window the popover's Sign in opens: `MacSignInView` in a small
//  window of its own, under the menu bar icon and brought to the front. It
//  closes itself once you're signed in, or on Cancel. A plain AppKit window
//  rather than a SwiftUI `Window` scene, which would open at launch.
//

#if os(macOS)
import AppKit
import ClerkKit
import SwiftUI

@MainActor
final class MacSignInWindow {
    private(set) var window: NSWindow?
    /// Brings the app forward first; see `MacWindowOpening`.
    var activate: () -> Void = { NSApp.activate(ignoringOtherApps: true) }
    /// Where a new window opens; `MacServices` puts it under the menu bar
    /// icon (`MenuBarController.place`).
    var place: (NSWindow) -> Void = { $0.center() }

    var isVisible: Bool { window?.isVisible ?? false }

    /// Show the window, in front, starting afresh unless it's already open.
    func show() {
        let window = isVisible ? self.window : makeWindow()
        self.window = window
        MacWindowOpening.open(activate: activate) {
            window?.makeKeyAndOrderFront(nil)
        }
    }

    func close() {
        window?.close()
    }

    private func makeWindow() -> NSWindow {
        let root = MacSignInView { [weak self] in self?.close() }
            .environment(Clerk.shared)
        let window = NSWindow(contentViewController: NSHostingController(rootView: root))
        window.title = "Sign in"
        window.styleMask = [.titled, .closable]
        window.isReleasedWhenClosed = false
        place(window)
        return window
    }
}
#endif
