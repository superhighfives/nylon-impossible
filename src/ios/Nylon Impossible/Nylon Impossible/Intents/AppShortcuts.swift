//
//  AppShortcuts.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//
//  Phrase rules: every phrase names the app, and a phrase may use only one
//  parameter of any kind — the metadata processor rejects the build
//  otherwise ("A single phrase can only use a single parameter"). So there is
//  no "Add {todo} to {list} in Nylon": "Add {todo} to Nylon" goes to Today,
//  and "Add to {list} in Nylon" names the list, then Siri asks "What's the
//  todo?". The list is matched against the names
//  `updateAppShortcutParameters()` registered. In the Shortcuts app both
//  parameters can be set together.
//

import AppIntents

struct NylonShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Add \(\.$task) to \(.applicationName)",
                "\(.applicationName) add \(\.$task)",
                "Add a todo to \(.applicationName)",
                "Add to \(\.$list) in \(.applicationName)",
                "New todo in \(.applicationName)",
                "\(.applicationName) new todo",
                "Save to \(.applicationName)"
            ],
            shortTitle: "Add Todo",
            systemImageName: "plus.circle"
        )
    }
}
