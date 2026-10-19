//
//  UserPreferencesService.swift
//  Nylon Impossible
//

import Foundation

@MainActor
@Observable
final class UserPreferencesService {
    private let apiService: any APIProviding

    /// Appearance preference: "light" | "dark" | "system". Synced across devices.
    var theme: String = "system"
    /// IANA zone the server's aging sweep uses for "local midnight".
    var timezone: String = "UTC"
    /// When true the app keeps `timezone` in step with the device. Picking a
    /// zone by hand in Settings turns it off.
    var timezoneAuto: Bool = true
    var isLoading: Bool = false
    var error: Error?

    /// Set once the account's preferences have loaded, so a device-zone report
    /// never runs against defaults and overwrites a manual choice.
    private var hasLoaded = false

    init(apiService: any APIProviding) {
        self.apiService = apiService
    }

    /// The device's current zone. `autoupdatingCurrent` follows a change made
    /// while the app is running, which `TimeZone.current` may not.
    static var deviceTimeZone: String { TimeZone.autoupdatingCurrent.identifier }

    /// Clears locally-held preference state on sign out so a subsequent sign-in
    /// with a different account doesn't inherit the previous account's theme.
    /// `fetchPreferences()` re-populates it for the new account.
    func resetLocalState() {
        theme = "system"
        timezone = "UTC"
        timezoneAuto = true
        hasLoaded = false
    }

    func fetchPreferences() async {
        isLoading = true
        error = nil

        do {
            let user = try await apiService.getMe()
            apply(user)
            hasLoaded = true
        } catch {
            self.error = error
            print("Failed to fetch user preferences: \(error)")
        }

        isLoading = false

        // Launch is one of the moments the device zone is reported.
        await reportDeviceTimezone()
    }

    func setTheme(_ newTheme: String) async {
        let previousTheme = theme
        theme = newTheme
        error = nil

        do {
            let user = try await apiService.updateMe(UpdateUserRequest(theme: newTheme))
            theme = user.theme ?? "system"
        } catch {
            theme = previousTheme
            self.error = error
            print("Failed to update theme: \(error)")
        }
    }

    // MARK: - Timezone

    /// The zone to report, or nil when there's nothing to do: automatic is
    /// off, the zones already match, or the device zone isn't a real one.
    /// Mirrors `automaticTimezoneUpdate` in `@nylon-impossible/shared`.
    nonisolated static func automaticTimezoneUpdate(
        stored: String,
        isAutomatic: Bool,
        device: String
    ) -> String? {
        guard isAutomatic,
              !device.isEmpty,
              TimeZone(identifier: device) != nil,
              device != stored else { return nil }
        return device
    }

    /// Report the device zone if the account follows it and it changed. Called
    /// on launch, on `NSSystemTimeZoneDidChange`, and on return to the
    /// foreground. Silent on failure; the next trigger tries again.
    func reportDeviceTimezone(_ device: String = UserPreferencesService.deviceTimeZone) async {
        guard hasLoaded,
              let next = Self.automaticTimezoneUpdate(
                stored: timezone,
                isAutomatic: timezoneAuto,
                device: device
              ) else { return }

        do {
            apply(try await apiService.updateMe(UpdateUserRequest(timezone: next)))
        } catch {
            print("Failed to report device timezone: \(error)")
        }
    }

    /// Pick a zone by hand. Turns automatic off so travelling doesn't undo it.
    func setManualTimezone(_ zone: String) async {
        await updateTimezone(zone: zone, isAutomatic: false)
    }

    /// Hand the zone back to the device.
    func setAutomaticTimezone(device: String = UserPreferencesService.deviceTimeZone) async {
        await updateTimezone(zone: device, isAutomatic: true)
    }

    private func updateTimezone(zone: String, isAutomatic: Bool) async {
        let previous = (timezone, timezoneAuto)
        timezone = zone
        timezoneAuto = isAutomatic
        error = nil

        do {
            apply(try await apiService.updateMe(
                UpdateUserRequest(timezone: zone, timezoneAuto: isAutomatic)
            ))
        } catch {
            (timezone, timezoneAuto) = previous
            self.error = error
            print("Failed to update timezone: \(error)")
        }
    }

    private func apply(_ user: APIUser) {
        theme = user.theme ?? "system"
        timezone = user.timezone ?? "UTC"
        timezoneAuto = user.timezoneAuto ?? true
    }
}
