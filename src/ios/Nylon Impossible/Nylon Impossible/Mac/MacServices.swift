//
//  MacServices.swift
//  Nylon Impossible
//
//  One set of services for the whole Mac app. On iOS the window owns its
//  services; the Mac app has no window, only the menu bar popover, Settings
//  and Sign in, so they all read the same auth, sync and preferences from
//  here. Created on first use, which is always after `Clerk.configure` in the
//  App's `init`.
//

#if os(macOS)
import AppIntents
import AppKit
import SwiftData
import SwiftUI

@MainActor
@Observable
final class MacServices {
    static let shared = MacServices()

    let authService: AuthService
    let syncService: SyncService
    let preferencesService: UserPreferencesService
    let settings: MacSettings
    @ObservationIgnored private(set) var hotKey: GlobalHotKey?
    @ObservationIgnored private(set) lazy var menuBar = MenuBarController(services: self)
    @ObservationIgnored private(set) lazy var signInWindow = MacSignInWindow()
    @ObservationIgnored private lazy var session = MacSession(services: self)
    @ObservationIgnored private let widgetReloader = MacWidgetReloader()

    @ObservationIgnored private var hasStarted = false

    var container: ModelContainer { SharedModelContainer.shared }

    private init() {
        let auth = AuthService()
        authService = auth
        syncService = SyncService(authService: auth)
        let apiService = APIService(authService: auth)
        preferencesService = UserPreferencesService(apiService: apiService, cache: .standard)
        settings = MacSettings()
    }

    /// Everything the app is: the session, the menu bar icon, the hotkey, and
    /// the observers that sync and reload the widget when the store changes. Called once, at launch.
    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        #if DEBUG
        // Screenshot runs use sample data in memory, drawn in a window; leave
        // the real store, the session, the menu bar and the hotkey alone.
        if let route = ScreenRoute.launch {
            MacScreenRouteWindow.show(route)
            return
        }
        #endif
        syncService.setModelContext(container.mainContext)
        session.start()
        widgetReloader.start()
        // The widget's tick and the share extension write from their own
        // processes; sync so their changes reach the server and the popover.
        StoreChangeSignal.observe { [weak self] in
            guard let self, self.authService.isSignedIn else { return }
            Task { await self.syncService.sync() }
        }
        menuBar.start()
        applyHotKey()
        followRoutes()
        // A link that opened the app arrived before anything was watching.
        if QuickActionService.shared.pending != nil { menuBar.show() }
        NylonShortcuts.updateAppShortcutParameters()
    }

    /// Anything that posts a route — the widget's "+", `OpenComposerIntent`,
    /// a `nylon://` link — opens the popover, which picks the route's list.
    private func followRoutes() {
        withObservationTracking {
            _ = QuickActionService.shared.pending
        } onChange: { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                if QuickActionService.shared.pending != nil { self.menuBar.show() }
                self.followRoutes()
            }
        }
    }

    /// Settings, in front. `open` is the popover's `openSettings`.
    func showSettings(_ open: () -> Void) {
        MacWindowOpening.open(open)
    }

    /// The sign-in window, in front.
    func showSignIn() {
        signInWindow.show()
    }

    /// Register (or re-register) the global hotkey from Settings. It opens the
    /// same popover the icon does.
    func applyHotKey() {
        hotKey?.unregister()
        hotKey = nil
        guard settings.hotKeyEnabled else {
            settings.hotKeyStatus = .off
            return
        }
        let key = GlobalHotKey(shortcut: settings.hotKey) { [weak self] in
            self?.menuBar.toggle()
        }
        settings.hotKeyStatus = key.register() ? .registered : .unavailable
        hotKey = key
    }
}
#endif
