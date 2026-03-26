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
    var isLoading: Bool = false
    var error: Error?

    init(apiService: APIService) {
        self.apiService = apiService
    }

    func fetchPreferences() async {
        isLoading = true
        error = nil

        do {
            let user = try await apiService.getMe()
            aiEnabled = user.aiEnabled
        } catch {
            self.error = error
            print("Failed to fetch user preferences: \(error)")
        }

        isLoading = false
    }

    func toggleAI() async {
        let newValue = !aiEnabled
        // Optimistic update
        aiEnabled = newValue
        error = nil

        do {
            let user = try await apiService.updateMe(aiEnabled: newValue)
            aiEnabled = user.aiEnabled
        } catch {
            // Revert on error
            aiEnabled = !newValue
            self.error = error
            print("Failed to update AI preference: \(error)")
        }
    }
}
