//
//  AppGroup.swift
//  Nylon Impossible
//
//  The App Group the app and its extensions share: the SwiftData store, and
//  the signed-in user id in shared defaults. Compiled into every target.
//
//  iOS uses the `group.` form. On macOS the group carries the Team ID prefix
//  instead — the form macOS has always accepted without registering the
//  group or putting it in a provisioning profile (an iOS-style `group.` ID is
//  only honoured on macOS 15+, and only when a profile authorises it). Each
//  device keeps its own local store, so the Mac's group never needs to match
//  the phone's; it only has to match the Mac targets' entitlements, which
//  spell it `$(TeamIdentifierPrefix)com.superhighfives.Nylon-Impossible`.
//

import Foundation

enum AppGroup {
    /// The team that signs every target (`DEVELOPMENT_TEAM`).
    static let teamIdentifier = "TGHU37N6EX"

    #if os(macOS)
    static let identifier = "\(teamIdentifier).com.superhighfives.Nylon-Impossible"
    #else
    static let identifier = "group.com.superhighfives.Nylon-Impossible"
    #endif

    /// Defaults every target can read: who's signed in, for the ones that
    /// can't ask Clerk.
    static var defaults: UserDefaults? {
        UserDefaults(suiteName: identifier)
    }

    /// The shared container the store lives in, or nil when the entitlement
    /// is missing (an unsigned build, say).
    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}
