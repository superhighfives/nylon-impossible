//
//  UserPreferencesService.swift
//  Nylon Impossible
//

import Foundation

@MainActor
@Observable
final class UserPreferencesService {
    private let apiService: APIService

    /// UserDefaults key for the locally-cached `hideCompleted` value.
    private static let hideCompletedDefaultsKey = "hideCompletedPreference"

    var aiEnabled: Bool = true
    var plan: String = "free"
    var location: String? = nil
    /// Appearance preference: "light" | "dark" | "system". Synced across devices.
    var theme: String = "system"
    /// When true, completed todos are hidden from the list. Synced across devices.
    ///
    /// Cached locally in UserDefaults and seeded from that cache so the first
    /// render at launch already reflects the saved state. `fetchPreferences()`
    /// runs only after the initial sync, so without this seed the list would
    /// briefly show the default (expanded) state and then snap to the synced
    /// value — the visible flash on cold start.
    var hideCompleted: Bool = UserDefaults.standard.bool(
        forKey: UserPreferencesService.hideCompletedDefaultsKey
    ) {
        didSet {
            UserDefaults.standard.set(hideCompleted, forKey: Self.hideCompletedDefaultsKey)
        }
    }
    var isLoading: Bool = false
    var error: Error?

    /// AI is a paid feature — only pro users see the toggle.
    var isPro: Bool { plan == "pro" }

    init(apiService: APIService) {
        self.apiService = apiService
    }

    func fetchPreferences() async {
        isLoading = true
        error = nil

        do {
            let user = try await apiService.getMe()
            aiEnabled = user.aiEnabled
            plan = user.plan ?? "free"
            location = user.location
            theme = user.theme ?? "system"
            hideCompleted = user.hideCompleted ?? false
        } catch {
            self.error = error
            print("Failed to fetch user preferences: \(error)")
        }

        isLoading = false
    }

    func setAI(enabled: Bool) async {
        let previousValue = aiEnabled
        aiEnabled = enabled
        error = nil

        do {
            let user = try await apiService.updateMe(UpdateUserRequest(aiEnabled: enabled, location: nil))
            aiEnabled = user.aiEnabled
        } catch {
            aiEnabled = previousValue
            self.error = error
            print("Failed to update AI preference: \(error)")
        }
    }

    func setTheme(_ newTheme: String) async {
        let previousTheme = theme
        theme = newTheme
        error = nil

        do {
            let user = try await apiService.updateMe(
                UpdateUserRequest(aiEnabled: nil, location: nil, theme: newTheme))
            theme = user.theme ?? "system"
        } catch {
            theme = previousTheme
            self.error = error
            print("Failed to update theme: \(error)")
        }
    }

    func setHideCompleted(_ newValue: Bool) async {
        let previousValue = hideCompleted
        hideCompleted = newValue
        error = nil

        do {
            let user = try await apiService.updateMe(
                UpdateUserRequest(aiEnabled: nil, location: nil, hideCompleted: newValue))
            hideCompleted = user.hideCompleted ?? false
        } catch {
            hideCompleted = previousValue
            self.error = error
            print("Failed to update hide completed preference: \(error)")
        }
    }

    func setLocation(_ text: String) async {
        let previousLocation = location
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        let newLocation: String? = trimmed.isEmpty ? nil : trimmed
        location = newLocation
        error = nil

        do {
            let user = try await apiService.updateMe(UpdateUserRequest(aiEnabled: nil, location: .some(newLocation)))
            location = user.location
        } catch {
            location = previousLocation
            self.error = error
            print("Failed to update location: \(error)")
        }
    }
}
