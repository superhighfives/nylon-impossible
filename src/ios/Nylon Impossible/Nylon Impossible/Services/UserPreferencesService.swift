//
//  UserPreferencesService.swift
//  Nylon Impossible
//

import Foundation

@MainActor
@Observable
final class UserPreferencesService {
    private let apiService: APIService
    private var updateTask: Task<Void, Never>?

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

    func setAI(enabled: Bool) async {
        // Cancel any in-flight update to prevent race conditions
        updateTask?.cancel()

        let previousValue = aiEnabled
        // Optimistic update
        aiEnabled = enabled
        error = nil

        updateTask = Task {
            do {
                let user = try await apiService.updateMe(aiEnabled: enabled)
                // Only apply if this task wasn't cancelled
                if !Task.isCancelled {
                    aiEnabled = user.aiEnabled
                }
            } catch {
                // Only revert if this task wasn't cancelled
                if !Task.isCancelled {
                    aiEnabled = previousValue
                    self.error = error
                    print("Failed to update AI preference: \(error)")
                }
            }
        }

        await updateTask?.value
    }
}
