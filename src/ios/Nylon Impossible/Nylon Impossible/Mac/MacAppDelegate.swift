//
//  MacAppDelegate.swift
//  Nylon Impossible
//
//  The Mac's application delegate: the few things SwiftUI's `App` has no
//  hook for. `nylon://` URLs (the widget's "+", a typed link) are parked on
//  `QuickActionService` like the iOS scene delegate does, and closing the
//  last window leaves the app running so the menu bar extra, the hotkey and
//  the Dock badge keep working.
//

#if os(macOS)
import AppKit

@MainActor
final class MacAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        MacServices.shared.start()
    }

    /// The menu bar extra and the hotkey are still useful with no window.
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
