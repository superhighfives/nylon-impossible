//
//  APIError.swift
//  Nylon Impossible
//
//  Split out of APIService.swift so targets that talk to the API without
//  pulling in the full client — the widget extension's sync-on-toggle path,
//  via BackgroundSyncService — can throw and classify the same errors.
//

import Foundation

enum APIError: Error, LocalizedError {
    case unauthorized(url: String)
    case networkError(Error, url: String)
    case invalidResponse(url: String)
    case serverError(Int, String?, url: String)
    case decodingError(Error, url: String, statusCode: Int, responseBody: String)

    var errorDescription: String? {
        switch self {
        case .unauthorized(let url):
            return "Not authorized. Please sign in again. [URL: \(url)]"
        case .networkError(let error, let url):
            return "Network error: \(error.localizedDescription) [URL: \(url)]"
        case .invalidResponse(let url):
            return "Invalid response from server [URL: \(url)]"
        case .serverError(let code, let message, let url):
            return "Server error (\(code)): \(message ?? "Unknown") [URL: \(url)]"
        case .decodingError(let error, let url, let statusCode, let responseBody):
            return "Failed to decode response: \(error.localizedDescription) [URL: \(url), status: \(statusCode), body: \(responseBody)]"
        }
    }
}

extension APIError {
    /// True when `error` is a URLSession-level failure surfaced by `APIService`. These are
    /// reported (or intentionally dropped when transient) at the network layer, so higher
    /// layers should not re-capture them to Sentry — doing so creates a duplicate issue for
    /// a single failure.
    static func isNetworkFailure(_ error: Error) -> Bool {
        if case .networkError(_, _)? = error as? APIError { return true }
        return false
    }

    /// Expected, transient connectivity failures — request timeouts, offline, dropped
    /// connections, cancellations. These are normal on mobile (especially for background
    /// syncs) and are pure noise in Sentry, so we don't report them as errors.
    static func isTransientNetworkError(_ error: Error) -> Bool {
        var underlying = error
        if case .networkError(let inner, _)? = error as? APIError {
            underlying = inner
        }
        // Swift-concurrency cancellations (e.g. a sync Task torn down on
        // backgrounding) surface as CancellationError, not URLError.
        if underlying is CancellationError { return true }
        guard let urlError = underlying as? URLError else { return false }
        switch urlError.code {
        case .timedOut, .notConnectedToInternet, .networkConnectionLost,
             .cancelled, .dataNotAllowed, .internationalRoamingOff:
            return true
        default:
            return false
        }
    }
}
