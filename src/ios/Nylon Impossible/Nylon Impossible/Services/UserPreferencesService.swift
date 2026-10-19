//
//  UserPreferencesService.swift
//  Nylon Impossible
//

import Foundation

@MainActor
@Observable
final class UserPreferencesService {
    private let apiService: APIService

    /// Appearance preference: "light" | "dark" | "system". Synced across devices.
    var theme: String = "system"
    var isLoading: Bool = false
    var error: Error?

    init(apiService: APIService) {
        self.apiService = apiService
    }

    /// Clears locally-held preference state on sign out so a subsequent sign-in
    /// with a different account doesn't inherit the previous account's theme.
    /// `fetchPreferences()` re-populates it for the new account.
    func resetLocalState() {
        theme = "system"
    }

    func fetchPreferences() async {
        isLoading = true
        error = nil

        do {
            let user = try await apiService.getMe()
            theme = user.theme ?? "system"
        } catch {
            self.error = error
            print("Failed to fetch user preferences: \(error)")
        }

        isLoading = false
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
}
