//
//  AddTodoControl.swift
//  Nylon Widget
//
//  "Add todo" for Control Center, the Lock Screen's bottom corners and the
//  Action button: one tap opens Nylon with the composer focused on Today,
//  through the same route as the widget's "+" and `nylon://add?list=today`.
//

#if os(iOS)
import AppIntents
import SwiftUI
import WidgetKit

struct AddTodoControl: ControlWidget {
    static let kind = "com.superhighfives.Nylon-Impossible.add-todo"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenComposerIntent(list: .today)) {
                Label("Add todo", systemImage: "plus")
            }
        }
        .displayName("Add todo")
        .description("Open Nylon ready to type a new todo.")
    }
}
#endif
