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

/// Helper service for auth-related operations like getting JWT tokens
@Observable
@MainActor
final class AuthService {
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
        do {
            try await clerk.auth.signOut()
        } catch {
            print("Sign out error: \(error)")
        }
    }
}
