//
//  AuthService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation
import ClerkKit
import Sentry

enum AuthError: Error, LocalizedError {
    case notAuthenticated
    case tokenFailed
    
    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not authenticated"
        case .tokenFailed:
            return "Failed to get authentication token"
        }
    }
}

@MainActor
protocol AuthProviding {
    var isSignedIn: Bool { get }
    var userId: String? { get }
    func getToken() async throws -> String
}

/// Helper service for auth-related operations like getting JWT tokens
@Observable
@MainActor
final class AuthService: AuthProviding {
    // Access Clerk.shared lazily to avoid accessing before configure()
    private var clerk: Clerk { Clerk.shared }
    
    var isSignedIn: Bool {
        clerk.user != nil
    }
    
    var userId: String? {
        clerk.user?.id
    }
    
    var userEmail: String? {
        clerk.user?.primaryEmailAddress?.emailAddress
    }

    /// "Charlie Gleason", for the account sheet. Nil without a name on the
    /// account.
    var userDisplayName: String? {
        let parts = [clerk.user?.firstName, clerk.user?.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    /// "CG", for the avatar when there's no image.
    var userInitials: String? {
        let source = userDisplayName ?? userEmail
        guard let source else { return nil }
        let letters = source
            .split(whereSeparator: { $0 == " " || $0 == "." || $0 == "@" })
            .prefix(2)
            .compactMap(\.first)
        return letters.isEmpty ? nil : String(letters).uppercased()
    }

    /// The signed-in user's avatar, mirroring the Clerk `UserButton` shown in
    /// the web header. `nil` when there's no user or no image on the account.
    var userImageURL: URL? {
        guard let urlString = clerk.user?.imageUrl, !urlString.isEmpty else {
            return nil
        }
        return URL(string: urlString)
    }

    /// Get the current JWT token for API calls
    func getToken() async throws -> String {
        guard let token = try await clerk.auth.getToken() else {
            throw AuthError.tokenFailed
        }
        return token
    }
    
    /// Sign out the current user
    func signOut() async {
        clearSharedSessionState()
        do {
            try await clerk.auth.signOut()
        } catch {
            print("Sign out error: \(error)")
        }
    }
    
    /// Persist userId to shared UserDefaults for Siri and Share Extension access
    func persistUserIdToSharedDefaults() {
        let sharedDefaults = AppGroup.defaults
        sharedDefaults?.set(userId, forKey: BackgroundSyncService.userIdKey)
    }

    /// Persist a fresh Clerk JWT and its real expiry to the Keychain, as the
    /// fallback `BackgroundSyncService` uses when it can't mint a token of its
    /// own. Clerk session tokens last 60 seconds, so this rarely outlives the
    /// moment the app was last open; the expiry comes from the token's `exp`
    /// so a stale one is never sent.
    /// Only writes when a token is successfully fetched to avoid an incoherent state
    /// (e.g. a nil token paired with a future expiry date).
    func persistAuthTokenToKeychain() async {
        do {
            let token = try await getToken()
            guard let expiry = BackgroundSyncService.expiry(ofJWT: token) else { throw AuthError.tokenFailed }
            try KeychainHelper.saveString(token, forKey: BackgroundSyncService.authTokenKey)
            try KeychainHelper.saveDate(expiry, forKey: BackgroundSyncService.authTokenExpiryKey)
        } catch {
            // Leave any existing token/expiry intact — a stale-but-valid token is
            // better than writing a nil token with a fresh expiry.
            SentrySDK.capture(error: error) { scope in
                scope.setTag(value: "auth", key: "area")
                scope.setTag(value: "token-persist", key: "event")
            }
            print("[AuthService] Failed to persist auth token to Keychain: \(error)")
        }
    }

    /// One-time migration: copy JWT from UserDefaults to Keychain, then remove the
    /// UserDefaults entries. No-op if the token is already in the Keychain or missing
    /// from UserDefaults.
    func migrateAuthTokenFromUserDefaultsToKeychain() {
        let sharedDefaults = AppGroup.defaults

        // Skip if Keychain already has a token
        guard KeychainHelper.loadString(forKey: BackgroundSyncService.authTokenKey) == nil else { return }

        guard
            let token = sharedDefaults?.string(forKey: BackgroundSyncService.authTokenKey),
            let expiry = sharedDefaults?.object(forKey: BackgroundSyncService.authTokenExpiryKey) as? Date
        else { return }

        do {
            try KeychainHelper.saveString(token, forKey: BackgroundSyncService.authTokenKey)
            try KeychainHelper.saveDate(expiry, forKey: BackgroundSyncService.authTokenExpiryKey)
            // Clean up old UserDefaults entries after successful migration
            sharedDefaults?.removeObject(forKey: BackgroundSyncService.authTokenKey)
            sharedDefaults?.removeObject(forKey: BackgroundSyncService.authTokenExpiryKey)
        } catch {
            print("[AuthService] Keychain migration failed: \(error)")
        }
    }

    /// Clear userId from shared UserDefaults and auth token from Keychain.
    /// Also removes legacy UserDefaults token entries for users who haven't migrated yet.
    ///
    /// Called on sign out, and again whenever Clerk finishes loading without a
    /// session — a stored session that expired or was revoked never runs
    /// `signOut()`, so without that second call the shared defaults keep naming
    /// the last account for every target that can't ask Clerk directly.
    func clearSharedSessionState() {
        let sharedDefaults = AppGroup.defaults
        sharedDefaults?.removeObject(forKey: BackgroundSyncService.userIdKey)
        // Clear legacy UserDefaults token entries (pre-Keychain migration)
        sharedDefaults?.removeObject(forKey: BackgroundSyncService.authTokenKey)
        sharedDefaults?.removeObject(forKey: BackgroundSyncService.authTokenExpiryKey)
        // Clear Keychain entries
        KeychainHelper.delete(key: BackgroundSyncService.authTokenKey)
        KeychainHelper.delete(key: BackgroundSyncService.authTokenExpiryKey)
    }
}
