//
//  AddTaskIntent.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import AppIntents
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
        
        // Get current userId from Keychain/UserDefaults if available
        // For Siri, we may not have auth context, so userId can be nil
        let userId: String? = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")?
            .string(forKey: "currentUserId")
        
        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
        
        let todo = TaskCreationService.createTask(
            title: task.title,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
        
        return .result(dialog: "Added '\(todo.title)' to Nylon")
    }
}
