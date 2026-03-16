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
                // Inline parameter - "Nylon add buy milk"
                "\(.applicationName) add \(\.$task)",
                // Fallback phrases - Siri will prompt for the task
                "\(.applicationName) new item",
                "\(.applicationName) add item",
                "Log something in \(.applicationName)",
                "Save to \(.applicationName)"
            ],
            shortTitle: "Add Task",
            systemImageName: "plus.circle"
        )
    }
}
