//
//  AuthService.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation
import ClerkKit

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
    
    /// Get the current JWT token for API calls
    func getToken() async throws -> String {
        guard let token = try await clerk.auth.getToken() else {
            throw AuthError.tokenFailed
        }
        return token
    }
    
    /// Sign out the current user
    func signOut() async {
        clearUserIdFromSharedDefaults()
        do {
            try await clerk.auth.signOut()
        } catch {
            print("Sign out error: \(error)")
        }
    }
    
    /// Persist userId to shared UserDefaults for Siri and Share Extension access
    func persistUserIdToSharedDefaults() {
        let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
        sharedDefaults?.set(userId, forKey: "currentUserId")
    }

    /// Persist a fresh Clerk JWT (with ~50-minute expiry) to the Keychain so
    /// BackgroundSyncService can authenticate from an App Intent extension or BGTask.
    /// Only writes when a token is successfully fetched to avoid an incoherent state
    /// (e.g. a nil token paired with a future expiry date).
    func persistAuthTokenToKeychain() async {
        do {
            let token = try await getToken()
            try KeychainHelper.saveString(token, forKey: BackgroundSyncService.authTokenKey)
            try KeychainHelper.saveDate(Date().addingTimeInterval(50 * 60), forKey: BackgroundSyncService.authTokenExpiryKey)
        } catch {
            // Leave any existing token/expiry intact — a stale-but-valid token is
            // better than writing a nil token with a fresh expiry.
            print("[AuthService] Failed to persist auth token to Keychain: \(error)")
        }
    }

    /// One-time migration: copy JWT from UserDefaults to Keychain, then remove the
    /// UserDefaults entries. No-op if the token is already in the Keychain or missing
    /// from UserDefaults.
    func migrateAuthTokenFromUserDefaultsToKeychain() {
        let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")

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

    /// Clear userId from shared UserDefaults and auth token from Keychain on sign out
    private func clearUserIdFromSharedDefaults() {
        let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
        sharedDefaults?.removeObject(forKey: "currentUserId")
        KeychainHelper.delete(key: BackgroundSyncService.authTokenKey)
        KeychainHelper.delete(key: BackgroundSyncService.authTokenExpiryKey)
    }
}
