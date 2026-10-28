//
//  OpenComposerIntent.swift
//  Nylon Impossible
//
//  "New todo": open Nylon with the composer focused on a list. Behind the
//  Today widget's "+", the Control Center / Lock Screen control, and the
//  Action button or a Shortcut. A widget can't take text, so this is the
//  quickest way in from one.
//
//  Compiled into the app and the widget extension. Because it opens the app,
//  the system runs it in the app's process, where `QuickActionService` hands
//  the route to `ContentView` — the same path as `nylon://add?list=…` and the
//  Home Screen quick action.
//

import AppIntents

struct OpenComposerIntent: AppIntent {
    static var title: LocalizedStringResource = "New todo"
    static var description = IntentDescription("Open Nylon ready to type a new todo.")
    static var openAppWhenRun: Bool = true

    /// Today when left out.
    @Parameter(title: "List")
    var list: TodoListEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("New todo in \(\.$list)")
    }

    init() {}

    init(list: TodoListEntity?) {
        self.list = list
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        QuickActionService.shared.post(.add(list: list?.target ?? .today))
        return .result()
    }
}
