//
//  MacLoginItem.swift
//  Nylon Impossible
//
//  Open at login: Nylon as the Mac's login item (`SMAppService.mainApp`), so
//  the menu bar icon and the quick-add hotkey are there after a restart. The
//  system holds the setting, not UserDefaults, because it can be changed in
//  System Settings → General → Login Items too; Settings reads it back.
//
//  It's on by default with consent (App Review 2.4.5(iii)): a fresh sign-in
//  has an "Open at login" checkbox, ticked. After that, only the person turns
//  it on or off. A Mac signed in before this shipped starts off: Nylon was
//  unreleased then, so it has no migration.
//

#if os(macOS)
import Foundation
import Observation
import ServiceManagement

/// `SMAppService` as the login item needs it, so tests use a fake rather than
/// changing the test Mac's login items.
protocol LoginItemService {
    var status: SMAppService.Status { get }
    func register() throws
    func unregister() throws
}

extension SMAppService: LoginItemService {}

@MainActor
@Observable
final class MacLoginItem {
    enum State: Equatable {
        case off
        case on
        /// Registered, but macOS waits for the person to allow it in Login Items.
        case needsApproval
        /// Turning it on failed; the toggle reads off.
        case failedToTurnOn
        /// Turning it off failed; the toggle reads on.
        case failedToTurnOff
    }

    /// Set once the person has chosen: with the sign-in checkbox, or with the
    /// Settings toggle.
    static let chosenKey = "mac.openAtLoginChosen"

    @ObservationIgnored private let service: LoginItemService
    @ObservationIgnored private let defaults: UserDefaults
    private(set) var state: State = .off

    init(service: LoginItemService = SMAppService.mainApp, defaults: UserDefaults = .standard) {
        self.service = service
        self.defaults = defaults
        refresh()
    }

    var isOn: Bool { state == .on || state == .needsApproval || state == .failedToTurnOff }

    /// What the sign-in checkbox starts as: ticked the first time, then
    /// whatever it is now, so signing in again doesn't undo a "no".
    var signInDefault: Bool { !defaults.bool(forKey: Self.chosenKey) || isOn }

    /// Read the system's state again: Settings does this when it opens. A
    /// failure stays while the system hasn't changed, since one at sign-in
    /// happens after its window has closed.
    func refresh() {
        let now = Self.state(for: service.status)
        if state == .failedToTurnOn, now == .off { return }
        if state == .failedToTurnOff, now != .off { return }
        state = now
    }

    func setEnabled(_ enabled: Bool) {
        defaults.set(true, forKey: Self.chosenKey)
        do {
            if enabled { try service.register() } else { try service.unregister() }
            state = Self.state(for: service.status)
        } catch {
            state = enabled ? .failedToTurnOn : .failedToTurnOff
        }
    }

    /// A fresh sign-in finished, with the checkbox ticked or not.
    func signedIn(openAtLogin: Bool) {
        defaults.set(true, forKey: Self.chosenKey)
        if openAtLogin != isOn { setEnabled(openAtLogin) }
    }

    static func state(for status: SMAppService.Status) -> State {
        switch status {
        case .enabled: return .on
        case .requiresApproval: return .needsApproval
        case .notRegistered, .notFound: return .off
        @unknown default: return .off
        }
    }
}
#endif
