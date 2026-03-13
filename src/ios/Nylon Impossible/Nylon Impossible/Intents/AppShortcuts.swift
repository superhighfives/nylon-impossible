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
                "Add a task to \(.applicationName)",
                "Create a task in \(.applicationName)",
                "Add something to \(.applicationName)",
                "New task in \(.applicationName)",
                "Remind me in \(.applicationName)"
            ],
            shortTitle: "Add Task",
            systemImageName: "plus.circle"
        )
    }
}
