//
//  MacSession.swift
//  Nylon Impossible
//
//  What `RootView` does for a signed-in window on iOS, for a Mac app that has
//  no window: follow Clerk's session, and on sign-in sync, connect the socket
//  and fetch preferences; on sign-out drop the shared session state. Both
//  sides run the same steps, from `SessionLifecycle`. With no scene to become
//  active, waking from sleep stands in for "the app came back".
//

#if os(macOS)
import AppKit
import ClerkKit
import Foundation

@MainActor
final class MacSession {
    private unowned let services: MacServices
    /// Whether the last look found a session, so a change is seen once.
    private var wasSignedIn: Bool?
    private var observers: [NSObjectProtocol] = []

    init(services: MacServices) {
        self.services = services
    }

    func start() {
        follow()
        let workspace = NSWorkspace.shared.notificationCenter
        observers.append(workspace.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.cameBack() }
        })
        observers.append(NotificationCenter.default.addObserver(forName: .NSSystemTimeZoneDidChange, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.services.authService.isSignedIn else { return }
                Task { await self.services.preferencesService.reportDeviceTimezone() }
            }
        })
    }

    /// Re-run whenever Clerk's client or user changes.
    private func follow() {
        let clerk = Clerk.shared
        let state = withObservationTracking {
            (loaded: clerk.client != nil, signedIn: clerk.user != nil)
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in self?.follow() }
        }
        guard state.loaded else { return }
        let services = services
        if state.signedIn {
            guard wasSignedIn != true else { return }
            // A session found at launch, not one a sign-in just made: the
            // sign-in window's checkbox decides those.
            if wasSignedIn == nil { services.loginItem.restoredSession() }
            wasSignedIn = true
            SessionLifecycle.didSignIn(auth: services.authService)
            Task {
                await SessionLifecycle.initialSync(sync: services.syncService, preferences: services.preferencesService)
            }
        } else {
            if wasSignedIn == true {
                SessionLifecycle.didSignOut(sync: services.syncService, preferences: services.preferencesService)
            }
            guard wasSignedIn != false else { return }
            wasSignedIn = false
            SessionLifecycle.isSignedOut(auth: services.authService, preferences: services.preferencesService)
        }
    }

    private func cameBack() {
        guard services.authService.isSignedIn else { return }
        SessionLifecycle.becameActive(
            auth: services.authService,
            sync: services.syncService,
            preferences: services.preferencesService
        )
    }
}
#endif
