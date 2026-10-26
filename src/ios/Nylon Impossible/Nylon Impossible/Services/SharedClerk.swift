//
//  SharedClerk.swift
//  Nylon Impossible
//
//  Clerk set up so the app and the widget share one session, and a fresh
//  session token for code that runs outside the app's UI: the widget's
//  checkbox, Siri, and the background upload.
//

import Foundation
import ClerkKit
import Security
import os

enum SharedClerk {
    private static let logger = Logger(subsystem: "com.superhighfives.Nylon-Impossible", category: "SharedClerk")

    /// The app's bundle id, which is ClerkKit's default service. Keeping it
    /// means a session saved before the access group was configured is still
    /// found: those items were written without a group, so they landed in the
    /// app's first (and only) keychain access group, the shared one below.
    static let service = "com.superhighfives.Nylon-Impossible"

    /// The keychain access group this process writes to by default, which
    /// is `<team>.com.superhighfives.Nylon-Impossible.shared`: the only group
    /// in the app's and the widget's entitlements. Read back from a probe
    /// item rather than written down, so the team prefix isn't hardcoded and
    /// it's always the group ClerkKit's existing items are in. Nil when the
    /// keychain can't be reached.
    static let accessGroup: String? = {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "\(service).access-group-probe",
            kSecAttrAccount as String: "probe",
            kSecReturnAttributes as String: true,
        ]
        var result: AnyObject?
        var status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            var add = query
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            status = SecItemAdd(add as CFDictionary, &result)
        }
        guard status == errSecSuccess,
              let attributes = result as? [String: Any],
              let group = attributes[kSecAttrAccessGroup as String] as? String,
              !group.isEmpty
        else { return nil }
        return group
    }()

    /// The same service and access group in every process. ClerkKit only
    /// notices another process's change to the session (a sign-out, a new
    /// device token) when the session lives in a shared access group.
    static var keychainConfig: Clerk.Options.KeychainConfig {
        .init(service: service, accessGroup: accessGroup)
    }

    @MainActor private static var isConfigured = false

    /// `Clerk.configure` may only run once per process, and `Clerk.shared`
    /// asserts if it hasn't run at all, so everything goes through here.
    @MainActor
    static func configure(options: Clerk.Options) {
        guard !isConfigured else { return }
        isConfigured = true
        Clerk.configure(publishableKey: Config.clerkPublishableKey, options: options)
    }

    /// A session token minted now, or nil when there's no session to mint
    /// one from (signed out, offline, or Clerk failed to load).
    ///
    /// Clerk session tokens last 60 seconds, so a token saved by the app is
    /// almost always stale by the time Siri or the widget needs it. On iOS
    /// this configures Clerk in whichever process it runs in, which is how
    /// the widget extension gets a token at all. On the Mac it only uses a
    /// Clerk the app already configured: the Mac's intents run in the app,
    /// and a Debug build keeps its session under a service the widget
    /// can't know (see `Nylon_ImpossibleApp.clerkOptions`).
    @MainActor
    static func freshToken() async -> String? {
        #if os(iOS)
        configure(options: Clerk.Options(keychainConfig: keychainConfig))
        #else
        guard isConfigured else { return nil }
        #endif

        let clerk = Clerk.shared
        do {
            // A process that just configured Clerk may not have a session in
            // memory yet; loading the client fills it in from the shared
            // device token.
            if clerk.session == nil {
                try await clerk.refreshClient()
            }
            return try await clerk.auth.getToken()
        } catch {
            logger.error("Couldn't mint a session token: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
