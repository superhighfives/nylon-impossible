//
//  MacServices.swift
//  Nylon Impossible
//
//  One set of services for every Mac scene. On iOS the window owns its
//  services; a Mac app has a main window, a Settings window, a menu bar extra
//  and a hotkey panel, any of which can be open while the others aren't, so
//  they all read the same auth, sync and preferences from here. Created on
//  first use, which is always after `Clerk.configure` in the App's `init`.
//

#if os(macOS)
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
    let feedbackService: FeedbackService
    let settings: MacSettings
    @ObservationIgnored private(set) var hotKey: GlobalHotKey?
    @ObservationIgnored let dockBadge: DockBadgeController
    @ObservationIgnored private(set) lazy var quickAddPanel = QuickAddPanelController(services: self)
    @ObservationIgnored private(set) lazy var menuBar = MenuBarController(services: self)

    @ObservationIgnored private var hasStarted = false

    var container: ModelContainer { SharedModelContainer.shared }

    private init() {
        let auth = AuthService()
        authService = auth
        syncService = SyncService(authService: auth)
        let apiService = APIService(authService: auth)
        preferencesService = UserPreferencesService(apiService: apiService, cache: .standard)
        feedbackService = FeedbackService(apiService: apiService)
        settings = MacSettings()
        dockBadge = DockBadgeController()
    }

    /// Everything that runs whether or not a window is open: the menu bar
    /// icon, the hotkey, the Dock badge and the store's save observer. Called
    /// once, at launch.
    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        #if DEBUG
        // Screenshot runs use sample data in memory; leave the real store,
        // the menu bar, the badge and the hotkey alone.
        guard ScreenRoute.launch == nil else { return }
        #endif
        syncService.setModelContext(container.mainContext)
        dockBadge.start(container: container, settings: settings)
        // The widget's tick and the share extension write from their own
        // processes; sync so their changes reach the server and this window.
        StoreChangeSignal.observe { [weak self] in
            guard let self, self.authService.isSignedIn else { return }
            Task { await self.syncService.sync() }
        }
        menuBar.start()
        applyHotKey()
        followRoutes()
    }

    /// Anything that posts a route — the widget's "+", `OpenComposerIntent`,
    /// a `nylon://` link — needs the board on screen to land in, even if its
    /// window was closed.
    private func followRoutes() {
        withObservationTracking {
            _ = QuickActionService.shared.pending
        } onChange: { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                if QuickActionService.shared.pending != nil { self.showMainWindow() }
                self.followRoutes()
            }
        }
    }

    /// Captured when the board window appears, so the menu bar panel, the
    /// hotkey panel and a `nylon://` link can bring the board back after its
    /// window was closed.
    @ObservationIgnored var openWindow: OpenWindowAction?

    /// Bring the board window forward, opening a new one if it was closed.
    func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first(where: { MacScenes.isBoardWindow($0) }) {
            if window.isMiniaturized { window.deminiaturize(nil) }
            window.makeKeyAndOrderFront(nil)
        } else {
            openWindow?(id: MacScenes.boardWindowId)
        }
    }

    /// Register (or re-register) the global hotkey from Settings.
    func applyHotKey() {
        hotKey?.unregister()
        hotKey = nil
        guard settings.hotKeyEnabled else {
            settings.hotKeyStatus = .off
            return
        }
        let key = GlobalHotKey(shortcut: settings.hotKey) { [weak self] in
            self?.quickAddPanel.toggle()
        }
        settings.hotKeyStatus = key.register() ? .registered : .unavailable
        hotKey = key
    }
}
#endif
