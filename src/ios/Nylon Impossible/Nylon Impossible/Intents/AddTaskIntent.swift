//
//  AddTaskIntent.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import AppIntents
import BackgroundTasks
import SwiftData

struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Task"
    static var description = IntentDescription("Add a new task to Nylon")
    
    /// Don't open the app when running via Siri - just confirm and return
    static var openAppWhenRun: Bool = false
    
    @Parameter(title: "Task", requestValueDialog: "What would you like to add?")
    var task: TaskTitle
    
    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$task) to Nylon")
    }
    
    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let container = SharedModelContainer.shared
        let context = ModelContext(container)

        let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")

        // Get current userId from Keychain/UserDefaults if available
        // For Siri, we may not have auth context, so userId can be nil
        let userId: String? = sharedDefaults?.string(forKey: "currentUserId")

        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)

        let todo = TaskCreationService.createTask(
            title: task.title,
            userId: userId,
            context: context,
            allTodos: allTodos
        )

        // Attempt an immediate sync to the server so the task is visible on other devices
        // without requiring the user to open the app. Fall back to a BGAppRefreshTask if
        // credentials are missing or the network request fails.
        if let defaults = sharedDefaults, let svc = BackgroundSyncService(sharedDefaults: defaults) {
            do {
                try await svc.sync(modelContainer: container)
            } catch {
                scheduleBackgroundSync()
            }
        } else {
            scheduleBackgroundSync()
        }

        return .result(dialog: "Added '\(todo.title)' to Nylon")
    }

    private func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: "com.nylonimpossible.backgroundsync")
        request.earliestBeginDate = nil
        try? BGTaskScheduler.shared.submit(request)
    }
}
