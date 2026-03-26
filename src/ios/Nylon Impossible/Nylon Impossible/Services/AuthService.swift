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

    /// Persist a fresh Clerk JWT (with ~50-minute expiry) to shared UserDefaults so
    /// BackgroundSyncService can authenticate from an App Intent extension or BGTask.
    func persistAuthTokenToSharedDefaults() async {
        let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
        let token = try? await getToken()
        sharedDefaults?.set(token, forKey: BackgroundSyncService.authTokenKey)
        sharedDefaults?.set(Date().addingTimeInterval(50 * 60), forKey: BackgroundSyncService.authTokenExpiryKey)
    }

    /// Clear userId from shared UserDefaults on sign out
    private func clearUserIdFromSharedDefaults() {
        let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
        sharedDefaults?.removeObject(forKey: "currentUserId")
        sharedDefaults?.removeObject(forKey: BackgroundSyncService.authTokenKey)
        sharedDefaults?.removeObject(forKey: BackgroundSyncService.authTokenExpiryKey)
    }
}
