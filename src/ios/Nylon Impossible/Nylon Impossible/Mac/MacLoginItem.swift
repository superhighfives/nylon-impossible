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
//  has an "Open at login" checkbox, ticked. A Mac that was already signed in
//  when this shipped turns it on once, at the first launch that restores its
//  session (#787). After that, only the person turns it on or off.
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
        case failed
    }

    /// Set once the default has been applied: by the sign-in checkbox, or by
    /// the one-time turn-on for a Mac that was already signed in.
    static let offeredKey = "mac.openAtLoginOffered"

    @ObservationIgnored private let service: LoginItemService
    @ObservationIgnored private let defaults: UserDefaults
    private(set) var state: State = .off

    init(service: LoginItemService = SMAppService.mainApp, defaults: UserDefaults = .standard) {
        self.service = service
        self.defaults = defaults
        refresh()
    }

    var isOn: Bool { state == .on || state == .needsApproval }

    /// What the sign-in checkbox starts as: ticked the first time, then
    /// whatever it is now, so signing in again doesn't undo a "no".
    var signInDefault: Bool { !defaults.bool(forKey: Self.offeredKey) || isOn }

    /// Read the system's state again: Settings does this when it opens.
    func refresh() {
        state = Self.state(for: service.status)
    }

    func setEnabled(_ enabled: Bool) {
        do {
            if enabled { try service.register() } else { try service.unregister() }
            refresh()
        } catch {
            refresh()
            if enabled { state = .failed }
        }
    }

    /// A fresh sign-in finished, with the checkbox ticked or not.
    func signedIn(openAtLogin: Bool) {
        defaults.set(true, forKey: Self.offeredKey)
        if openAtLogin != isOn { setEnabled(openAtLogin) }
    }

    /// The app launched and found a session it had already. The first time,
    /// on a Mac that never saw the checkbox, turn it on.
    func restoredSession() {
        guard !defaults.bool(forKey: Self.offeredKey) else { return }
        defaults.set(true, forKey: Self.offeredKey)
        setEnabled(true)
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
