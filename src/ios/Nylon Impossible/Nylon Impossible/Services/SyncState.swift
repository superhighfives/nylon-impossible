//
//  SyncState.swift
//  Nylon Impossible
//
//  What a sync is doing, and the words the error line uses when it fails.
//  Split from SyncService.swift.
//

import Foundation

enum SyncState: Equatable {
    case idle
    case syncing
    case success(Date)
    /// A failure, in words for the error line ("Can’t reach Nylon right
    /// now."). The technical detail goes to Sentry and the log, not here.
    case error(String)
}

/// What the sync error line says. `APIError`'s own descriptions carry the
/// request URL and the raw server body — right for Sentry, wrong on screen.
enum SyncErrorMessage {
    static func text(for error: Error) -> String {
        switch error as? APIError {
        case .unauthorized?:
            return "Sign in again to keep syncing."
        case .serverError(let code, _, _)? where code >= 500:
            return "Nylon’s server had a problem. Your changes are safe here."
        case .serverError?:
            return "The server didn’t accept the changes."
        case .networkError?:
            return "Can’t reach Nylon right now. Your changes are safe here."
        case .invalidResponse?, .decodingError?:
            return "Nylon sent back something unexpected."
        case nil:
            return "Something went wrong. Your changes are safe here."
        }
    }
}
