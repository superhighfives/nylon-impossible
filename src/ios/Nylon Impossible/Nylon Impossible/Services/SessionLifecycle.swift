//
//  SessionLifecycle.swift
//  Nylon Impossible
//
//  The steps around a session, shared by iOS's `RootView` (driven by its
//  window) and the Mac's `MacSession` (which has no window to drive it).
//

import Foundation
import Sentry

@MainActor
enum SessionLifecycle {
    /// Just signed in: tag Sentry (opaque ID only, no PII), and hand the
    /// session to Siri, the share extension and `BackgroundSyncService`
    /// through shared defaults and the Keychain. The widget reads sign-in
    /// state from shared defaults, which only just changed, so it reloads.
    static func didSignIn(auth: AuthService) {
        if let userId = auth.userId {
            SentrySDK.setUser(Sentry.User(userId: userId))
        }
        // Migrate any existing UserDefaults token to Keychain (one-time)
        auth.migrateAuthTokenFromUserDefaultsToKeychain()
        auth.persistUserIdToSharedDefaults()
        Task { await auth.persistAuthTokenToKeychain() }
        WidgetRefresh.reload()
    }

    /// The first sync of a session: local todos up, the server's down, then
    /// the socket and preferences.
    static func initialSync(sync: SyncService, preferences: UserPreferencesService?) async {
        await sync.migrateLocalTodos()
        await sync.sync()
        sync.connectWebSocket()
        await preferences?.fetchPreferences()
    }

    /// Just signed out: forget the account's sync state and preferences, so
    /// the next account doesn't inherit them.
    static func didSignOut(sync: SyncService?, preferences: UserPreferencesService?) {
        SentrySDK.setUser(nil)
        sync?.reset()
        preferences?.resetLocalState()
    }

    /// Clerk has loaded and there's no session: after a sign-out, or a launch
    /// whose stored session had expired or been revoked. Only the first runs
    /// `signOut()`, so without this the shared defaults keep naming the last
    /// account, and every Clerk-less target (the widget included) reads that
    /// as signed in. The cached sweep and zone outlive the process too.
    static func isSignedOut(auth: AuthService, preferences: UserPreferencesService?) {
        auth.clearSharedSessionState()
        preferences?.resetLocalState()
        // Take the signed-out user's todos off the Home Screen now.
        WidgetRefresh.reload()
    }

    /// Back after a while away: the socket, a fresh token for
    /// `BackgroundSyncService`'s fallback (see `SharedClerk`), the zone
    /// (travelling changes it without the notification), and the sweep, which
    /// runs at local midnight while the app is usually away.
    static func becameActive(auth: AuthService, sync: SyncService, preferences: UserPreferencesService?) {
        sync.connectWebSocket()
        Task { await auth.persistAuthTokenToKeychain() }
        Task { await preferences?.reportDeviceTimezone() }
        Task { await preferences?.refreshLastSweep() }
    }
}
