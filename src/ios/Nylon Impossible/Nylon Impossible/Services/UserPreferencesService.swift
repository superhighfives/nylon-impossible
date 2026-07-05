//
//  UserPreferencesService.swift
//  Nylon Impossible
//

import Foundation

@MainActor
@Observable
final class UserPreferencesService {
    private let apiService: APIService

    var aiEnabled: Bool = true
    var plan: String = "free"
    var location: String? = nil
    /// Appearance preference: "light" | "dark" | "system". Synced across devices.
    var theme: String = "system"
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
