//
//  MacAppDelegate.swift
//  Nylon Impossible
//
//  The Mac's application delegate: the few things SwiftUI's `App` has no
//  hook for. `nylon://` URLs (the widget's "+", a typed link) are parked on
//  `QuickActionService` like the iOS scene delegate does, and closing
//  Settings or Sign in leaves the app running: the menu bar icon is the app.
//

#if os(macOS)
import AppKit

@MainActor
final class MacAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        MacServices.shared.start()
    }

    /// The app is the menu bar icon; it has no window to close.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            if let link = DeepLink(url: url) {
                QuickActionService.shared.post(link)
            }
        }
    }
}
#endif
