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
    var location: String? = nil
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
            location = user.location
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
