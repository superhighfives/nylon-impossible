//
//  MacScenes.swift
//  Nylon Impossible
//
//  The Mac app is the menu bar icon and its popover (`MenuBarController`), so
//  its only scene is Settings. It has no board window, no Dock icon and no
//  app menu (`LSUIElement`); the web board is the one full editor. Sign in is
//  a plain window (`MacSignInWindow`), opened from the popover. Everything
//  reads its services from `MacServices`.
//

#if os(macOS)
import AppKit
import ClerkKit
import SwiftData
import SwiftUI

struct MacScenes: Scene {
    var body: some Scene {
        Settings {
            MacSettingsRoot()
        }
    }
}

/// Settings, with the popover's services.
struct MacSettingsRoot: View {
    private let services = MacServices.shared

    var body: some View {
        MacSettingsView()
            .environment(services.preferencesService)
            .environment(services.syncService)
            .environment(services.authService)
            .environment(services.settings)
            .environment(services.loginItem)
            .environment(Clerk.shared)
            .modelContainer(services.container)
            .preferredColorScheme(MacAppearance.colorScheme(for: services.preferencesService.theme))
    }
}

/// The menu bar icon's popover (see `MenuBarController`).
struct MacMenuBarRoot: View {
    var onDismiss: () -> Void
    var onFeedback: () -> Void
    private let services = MacServices.shared

    var body: some View {
        // Send feedback… is an admin's only.
        QuickAddView(onDismiss: onDismiss, onFeedback: services.preferencesService.isAdmin ? onFeedback : nil)
            .environment(services.feedbackService)
            .environment(services.authService)
            .environment(services.syncService)
            .environment(Clerk.shared)
            .modelContainer(services.container)
            .preferredColorScheme(MacAppearance.colorScheme(for: services.preferencesService.theme))
    }
}

enum MacAppearance {
    /// The synced appearance preference as a color scheme; nil follows the Mac.
    static func colorScheme(for theme: String) -> ColorScheme? {
        switch theme {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }
}

/// Bring the app forward before opening one of its windows. An `LSUIElement`
/// app isn't active while you use the popover (it's a non-activating panel),
/// so without this Settings and Sign in would open behind the app in front.
enum MacWindowOpening {
    static func open(activate: () -> Void = { NSApp.activate(ignoringOtherApps: true) }, _ open: () -> Void) {
        activate()
        open()
    }
}

#if DEBUG
/// A screenshot run (`-NylonScreen`) draws its route in an ordinary window,
/// since the app has no window of its own to draw it in.
@MainActor
enum MacScreenRouteWindow {
    private static var window: NSWindow?

    static func show(_ route: ScreenRoute) {
        if route == .feedback {
            showFeedback()
            return
        }
        let root = ScreenRouteRoot(route: route)
            .frame(minWidth: 480, minHeight: 360)
            .background(Theme.Colors.fill)
        let window = NSWindow(contentViewController: NSHostingController(rootView: root))
        window.title = "Nylon"
        window.setContentSize(NSSize(width: 960, height: 720))
        window.isReleasedWhenClosed = false
        window.center()
        self.window = window
        // A screenshot run is launched from a script; come to the front so
        // the capture is clean.
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    /// Send feedback… as the popover's footer does it: the popover, as an
    /// admin, snapshotted, closed, then the form in its own window.
    private static func showFeedback() {
        let panel = QuickAddPanel.make(content: NSHostingView(rootView: ScreenRouteRoot(route: .feedback)))
        panel.center()
        self.window = panel
        NSApp.activate(ignoringOtherApps: true)
        panel.orderFront(nil)
        let services = MacServices.shared
        services.feedbackWindow.theme = { ScreenRoute.forcesDark ? "dark" : "light" }
        Task { @MainActor in
            // Let the sample todos draw before the snapshot.
            try? await Task.sleep(for: .seconds(1))
            MacFeedbackHandoff.send(
                snapshot: { MacFeedbackSnapshot.of(panel) },
                close: { panel.orderOut(nil) },
                open: services.showFeedback
            )
        }
    }
}
#endif
#endif
