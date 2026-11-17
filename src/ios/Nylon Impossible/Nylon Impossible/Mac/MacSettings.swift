//
//  MacSettings.swift
//  Nylon Impossible
//
//  The Mac-only preferences: the quick-add hotkey. Per-Mac, so they live in this Mac's UserDefaults rather than
//  the account (theme and timezone, which follow you across devices, stay on
//  `UserPreferencesService`).
//

#if os(macOS)
import Foundation
import Observation

@MainActor
@Observable
final class MacSettings {
    enum HotKeyStatus: Equatable {
        case off
        case registered
        /// The combination is taken by another app or isn't allowed.
        case unavailable
    }

    /// `mac.showsMenuBarIcon` and `mac.showsDockBadge` are still in older
    /// installs' defaults, unread: the icon is the app now, and there's no
    /// Dock icon to badge.
    enum Key {
        static let hotKeyEnabled = "mac.hotKeyEnabled"
        static let hotKey = "mac.hotKey"
    }

    @ObservationIgnored private let defaults: UserDefaults

    var hotKeyEnabled: Bool {
        didSet { defaults.set(hotKeyEnabled, forKey: Key.hotKeyEnabled) }
    }

    var hotKey: HotKeyShortcut {
        didSet {
            if let data = try? JSONEncoder().encode(hotKey) {
                defaults.set(data, forKey: Key.hotKey)
            }
        }
    }

    /// Whether the hotkey is live; set by whoever registers it.
    var hotKeyStatus: HotKeyStatus = .off

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        hotKeyEnabled = defaults.object(forKey: Key.hotKeyEnabled) as? Bool ?? true
        hotKey = defaults.data(forKey: Key.hotKey)
            .flatMap { try? JSONDecoder().decode(HotKeyShortcut.self, from: $0) }
            .flatMap { $0.isValid ? $0 : nil }
            ?? .quickAddDefault
    }
}
#endif
