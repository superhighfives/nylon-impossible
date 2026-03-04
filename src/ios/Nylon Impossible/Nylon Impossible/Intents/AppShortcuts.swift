//
//  AppShortcuts.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import AppIntents

struct NylonShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Add \(\.$taskTitle) to \(.applicationName)",
                "Tell \(.applicationName) to add \(\.$taskTitle)",
                "Tell \(.applicationName) to remind me to \(\.$taskTitle)",
                "Add a task to \(.applicationName)",
                "Create a task in \(.applicationName)"
            ],
            shortTitle: "Add Task",
            systemImageName: "plus.circle"
        )
    }
}
