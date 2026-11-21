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
    /// Send feedback…, for an admin.
    let feedbackService: FeedbackService
    @ObservationIgnored private(set) var hotKey: GlobalHotKey?
    @ObservationIgnored private(set) lazy var menuBar = MenuBarController(services: self)
    @ObservationIgnored private(set) lazy var signInWindow = makeSignInWindow()
    @ObservationIgnored private(set) lazy var feedbackWindow = makeFeedbackWindow()
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
        feedbackService = FeedbackService(apiService: apiService)
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

    /// Settings, in front, under the menu bar icon. `open` is the popover's
    /// `openSettings`. SwiftUI opens it where it last was, or in the middle
    /// of the screen; it has made the window by the time `open` returns, so
    /// it moves before it's drawn. One that's already open stays put.
    func showSettings(_ open: () -> Void) {
        let wasOpen = Self.settingsWindow?.isVisible == true
        MacWindowOpening.open(open)
        if !wasOpen, let window = Self.settingsWindow { menuBar.place(window) }
    }

    /// SwiftUI's Settings window, once it's been opened.
    static var settingsWindow: NSWindow? {
        NSApp.windows.first { $0.identifier?.rawValue == "com_apple_SwiftUI_Settings_window" }
    }

    /// The sign-in window, in front.
    func showSignIn() {
        signInWindow.show()
    }

    /// The feedback form, in front, with the menu bar window's snapshot.
    func showFeedback(snapshot: MacFeedbackSnapshot?) {
        feedbackWindow.show(snapshot: snapshot)
    }

    private func makeSignInWindow() -> MacSignInWindow {
        let window = MacSignInWindow()
        window.place = { [weak self] in self?.menuBar.place($0) }
        return window
    }

    private func makeFeedbackWindow() -> MacFeedbackWindow {
        let window = MacFeedbackWindow(feedback: feedbackService)
        window.place = { [weak self] in self?.menuBar.place($0) }
        window.theme = { [unowned self] in self.preferencesService.theme }
        window.onFiled = { [weak self] in self?.menuBar.show() }
        return window
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
