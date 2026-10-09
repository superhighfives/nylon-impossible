//
//  WidgetSessionToken.swift
//  Nylon Widget
//
//  SPIKE: a fresh Clerk session token minted from inside the widget, so the
//  timeline can read the server instead of a local store that only the app
//  ever refreshes. Two ways to get one, picked at compile time:
//
//  - ClerkKit linked into the widget target → configure the SDK against the
//    app's keychain items and ask it. Supported API, but the whole SDK starts
//    up in a memory-capped extension, and ClerkKit 1.0.1 has unguarded
//    `UIApplication.shared` calls that may not compile here at all.
//  - Otherwise → read the two keychain items the SDK writes (the device token
//    and the cached client) and make the one request the SDK itself makes for
//    a token. No dependency, but leans on ClerkKit's private storage layout —
//    a Clerk upgrade can silently move it, and the widget then falls back to
//    the local store rather than breaking.
//
//  Either way the token is minted on demand and never stored, so its 60-second
//  default lifetime doesn't matter.
//

import Foundation
import Security

#if canImport(ClerkKit)
import ClerkKit
#endif

enum WidgetSessionToken {
    enum Failure: Error {
        case noSession
        case badResponse(Int)
    }

    /// ClerkKit's keychain items live under the *app's* bundle identifier —
    /// its default `service` — and land in the app's default access group,
    /// which is the first `keychain-access-groups` entry: the `.shared` group
    /// the widget is also entitled to. The widget's own bundle id would miss
    /// them.
    static let clerkKeychainService = "com.superhighfives.Nylon-Impossible"

    static func fetch() async throws -> String {
        #if canImport(ClerkKit)
        return try await viaClerkKit()
        #else
        return try await viaFrontendAPI()
        #endif
    }

    #if canImport(ClerkKit)
    @MainActor
    private static func viaClerkKit() async throws -> String {
        // `configure` loads the cached client from the keychain synchronously,
        // so a session is available before its own refresh calls return.
        // A widget process can serve many timeline requests; configure once.
        if !isConfigured {
            Clerk.configure(
                publishableKey: Config.clerkPublishableKey,
                options: .init(
                    telemetryEnabled: false,
                    keychainConfig: .init(service: clerkKeychainService)
                )
            )
            isConfigured = true
        }
        guard let token = try await Clerk.shared.auth.getToken() else {
            throw Failure.noSession
        }
        return token
    }

    @MainActor private static var isConfigured = false
    #endif

    // MARK: - Direct Frontend API

    /// Keychain account names from ClerkKit's `ClerkKeychainKey`.
    private enum ClerkKey {
        static let deviceToken = "clerkDeviceToken"
        static let cachedClient = "cachedClient"
    }

    /// The slice of ClerkKit's cached `Client` the token request needs. The
    /// SDK encodes it with snake_case keys.
    private struct CachedClient: Decodable {
        let lastActiveSessionId: String?
    }

    private struct TokenResponse: Decodable {
        let jwt: String
    }

    /// The API version ClerkKit 1.0.1 sends. Keep in step with the app's
    /// ClerkKit — `Clerk.apiVersion` in its `Version.swift`.
    private static let clerkAPIVersion = "2025-11-10"

    static func viaFrontendAPI() async throws -> String {
        guard
            let deviceToken = keychainString(ClerkKey.deviceToken),
            let clientData = keychainData(ClerkKey.cachedClient),
            let frontendAPI = frontendAPIURL(publishableKey: Config.clerkPublishableKey)
        else { throw Failure.noSession }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let sessionId = try decoder.decode(CachedClient.self, from: clientData).lastActiveSessionId
        else { throw Failure.noSession }

        var components = URLComponents(
            url: frontendAPI.appendingPathComponent("v1/client/sessions/\(sessionId)/tokens"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "_is_native", value: "true")]
        guard let url = components?.url else { throw Failure.noSession }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue(deviceToken, forHTTPHeaderField: "Authorization")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue(clerkAPIVersion, forHTTPHeaderField: "clerk-api-version")
        request.setValue("1", forHTTPHeaderField: "x-mobile")

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(status) else { throw Failure.badResponse(status) }
        return try JSONDecoder().decode(TokenResponse.self, from: data).jwt
    }

    /// A publishable key is `pk_live_` / `pk_test_` plus base64 of the
    /// Frontend API host with a trailing `$`.
    static func frontendAPIURL(publishableKey: String) -> URL? {
        guard let encoded = publishableKey.split(separator: "_", maxSplits: 2).last else { return nil }
        var base64 = String(encoded)
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64),
              let host = String(data: data, encoding: .utf8)?.trimmingCharacters(in: CharacterSet(charactersIn: "$"))
        else { return nil }
        return URL(string: "https://\(host)")
    }

    // `KeychainHelper` is pinned to the app's own `.shared` service name;
    // these read ClerkKit's. No access group: the query searches every group
    // the widget is entitled to.
    private static func keychainData(_ account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: clerkKeychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    private static func keychainString(_ account: String) -> String? {
        keychainData(account).flatMap { String(data: $0, encoding: .utf8) }
    }
}
