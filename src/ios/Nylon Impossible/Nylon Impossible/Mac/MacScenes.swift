//
//  MacScenes.swift
//  Nylon Impossible
//
//  The Mac app's scenes: the board window, Settings (⌘,) and the menu bar
//  extra. All three read their services from `MacServices`, so the menu bar
//  and Settings work with the window closed.
//

#if os(macOS)
import AppIntents
import AppKit
import ClerkKit
import SwiftData
import SwiftUI

struct MacScenes: Scene {
    static let boardWindowId = "board"

    /// SwiftUI names a `WindowGroup`'s windows "<id>-AppWindow-<n>".
    static func isBoardWindow(_ window: NSWindow) -> Bool {
        window.identifier?.rawValue.hasPrefix(boardWindowId) == true
    }

    @Bindable private var settings = MacServices.shared.settings

    var body: some Scene {
        WindowGroup("Nylon", id: Self.boardWindowId) {
            MacBoardWindow()
        }
        .defaultSize(width: 1280, height: 820)
        .windowResizability(.contentMinSize)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands { MacCommands() }

        Settings {
            MacSettingsRoot()
        }

        MenuBarExtra(isInserted: $settings.showsMenuBarIcon) {
            MacMenuBarRoot()
        } label: {
            Label("Nylon", image: "MenuBarIcon")
        }
        .menuBarExtraStyle(.window)
    }
}

/// The board window's content: the signed-in shell, or a DEBUG screenshot
/// route.
struct MacBoardWindow: View {
    @Environment(\.openWindow) private var openWindow
    private let services = MacServices.shared

    var body: some View {
        Group {
            #if DEBUG
            if let route = ScreenRoute.launch {
                ScreenRouteRoot(route: route)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.Colors.fill)
                    // A screenshot run is launched from a script; come to the
                    // front so a right-click lands and the capture is clean.
                    .onAppear { NSApp.activate(ignoringOtherApps: true) }
            } else {
                root
            }
            #else
            root
            #endif
        }
        .frame(minWidth: 720, minHeight: 480)
        .onAppear { services.openWindow = openWindow }
    }

    private var root: some View {
        RootView(syncService: services.syncService, preferencesService: services.preferencesService)
            .environment(Clerk.shared)
            .environment(services.authService)
            .modelContainer(services.container)
            .task { NylonShortcuts.updateAppShortcutParameters() }
    }
}

/// Settings, with the same services as the window.
struct MacSettingsRoot: View {
    private let services = MacServices.shared

    var body: some View {
        MacSettingsView()
            .environment(services.preferencesService)
            .environment(services.syncService)
            .environment(services.authService)
            .environment(services.settings)
            .environment(Clerk.shared)
            .modelContainer(services.container)
            .preferredColorScheme(MacAppearance.colorScheme(for: services.preferencesService.theme))
    }
}

/// The menu bar extra's window.
struct MacMenuBarRoot: View {
    @Environment(\.openWindow) private var openWindow
    private let services = MacServices.shared

    var body: some View {
        QuickAddView(presentation: .menuBar)
            .environment(services.authService)
            .environment(services.syncService)
            .environment(Clerk.shared)
            .modelContainer(services.container)
            .preferredColorScheme(MacAppearance.colorScheme(for: services.preferencesService.theme))
            .onAppear { services.openWindow = services.openWindow ?? openWindow }
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
#endif
