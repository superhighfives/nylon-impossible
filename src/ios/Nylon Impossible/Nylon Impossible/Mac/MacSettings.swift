//
//  MacSettings.swift
//  Nylon Impossible
//
//  The Mac-only preferences: the menu bar icon, the quick-add hotkey and the
//  Dock badge. Per-Mac, so they live in this Mac's UserDefaults rather than
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

    enum Key {
        static let showsMenuBarIcon = "mac.showsMenuBarIcon"
        static let showsDockBadge = "mac.showsDockBadge"
        static let hotKeyEnabled = "mac.hotKeyEnabled"
        static let hotKey = "mac.hotKey"
    }

    @ObservationIgnored private let defaults: UserDefaults

    var showsMenuBarIcon: Bool {
        didSet { defaults.set(showsMenuBarIcon, forKey: Key.showsMenuBarIcon) }
    }

    var showsDockBadge: Bool {
        didSet { defaults.set(showsDockBadge, forKey: Key.showsDockBadge) }
    }

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
        showsMenuBarIcon = defaults.object(forKey: Key.showsMenuBarIcon) as? Bool ?? true
        showsDockBadge = defaults.object(forKey: Key.showsDockBadge) as? Bool ?? true
        hotKeyEnabled = defaults.object(forKey: Key.hotKeyEnabled) as? Bool ?? true
        hotKey = defaults.data(forKey: Key.hotKey)
            .flatMap { try? JSONDecoder().decode(HotKeyShortcut.self, from: $0) }
            .flatMap { $0.isValid ? $0 : nil }
            ?? .quickAddDefault
    }
}
#endif
