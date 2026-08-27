//
//  CompleteTodoIntent.swift
//  Nylon Widget
//
//  Created by Claude on 8/27/26.
//

import AppIntents
import SwiftData

/// Completes a todo from the widget.
///
/// Completion runs through `TodoCompletionService` — the same code path the
/// app's checkbox uses — so a repeat rolls its due date forward and re-places
/// itself, a sticky todo unsticks, and subtasks follow their parent, rather
/// than the widget inventing a simpler rule and quietly disagreeing with the
/// app.
///
/// That service is a genuine toggle, but this is a one-way button: the widget
/// draws no checked state, because a completed todo leaves the list it shows.
/// So an already-completed todo is a no-op here rather than an un-complete —
/// see `perform()`.
struct CompleteTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Task"
    static var description = IntentDescription("Complete a task from the Nylon widget")

    /// Widget-only: `AddTaskIntent` is the one Nylon offers in Shortcuts and
    /// to Siri. This needs a todo's internal id to do anything, which is not
    /// something anyone can usefully supply by hand.
    static var isDiscoverable: Bool = false

    /// The todo's `id` as a UUID string. Ids travel through the intent rather
    /// than the model object because the widget process re-fetches from the
    /// store when the button is tapped — by then the entry it was rendered
    /// from can be hours old.
    @Parameter(title: "Task ID")
    var todoId: String

    init() {}

    init(todoId: String) {
        self.todoId = todoId
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let id = UUID(uuidString: todoId) else { return .result() }

        let container = SharedModelContainer.shared
        let context = ModelContext(container)

        let descriptor = FetchDescriptor<TodoItem>(predicate: #Predicate { $0.id == id })
        guard let todo = try? context.fetch(descriptor).first else {
            // Already gone — deleted on another device, or a placeholder from
            // the widget gallery. Nothing to do and nothing worth surfacing:
            // the reload below re-renders whatever the store now holds.
            WidgetRefresh.reload()
            return .result()
        }

        // Already done by the time the tap resolved: ticked off in the app just
        // before the widget's reload caught up, synced down from another
        // device, or a double-tap. The entry this button was drawn from is
        // stale, not the store — and since the button only ever offers
        // "complete", passing this to the toggle would un-complete instead,
        // rolling a repeat's dueDate back an occurrence with nothing on screen
        // to say so. Redraw and leave it alone.
        guard !todo.isEffectivelyCompleted else {
            WidgetRefresh.reload()
            return .result()
        }

        let userId = UserDefaults(suiteName: BackgroundSyncService.appGroupSuiteName)?
            .string(forKey: BackgroundSyncService.userIdKey)
        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
        let lists = fetchLists(context: context)

        TodoCompletionService.toggle(todo, allTodos: allTodos, lists: lists)

        do {
            try context.save()
        } catch {
            // The store rejected the write, so there is nothing to sync and
            // nothing to redraw — leave the row as it was rather than showing
            // a completion that didn't happen.
            print("[CompleteTodoIntent] Failed to save: \(error)")
            return .result()
        }

        WidgetRefresh.reload()

        // Push it now, the way the Siri intent does. Failing here is normal —
        // no credentials, an expired token, no signal — and costs nothing: the
        // todo is already marked unsynced locally, so the next foreground sync
        // picks it up. A widget can't schedule a BGTask to retry sooner.
        if let defaults = UserDefaults(suiteName: BackgroundSyncService.appGroupSuiteName),
           let service = BackgroundSyncService(sharedDefaults: defaults) {
            try? await service.sync(modelContainer: container)
        }

        return .result()
    }

    /// The user's lists, needed so a completed repeat lands in the right one
    /// (`TodoCompletionService` places the next occurrence by its due date).
    /// An empty list just means the repeat keeps its current placement.
    @MainActor
    private func fetchLists(context: ModelContext) -> [TodoListModel] {
        (try? context.fetch(FetchDescriptor<TodoListModel>())) ?? []
    }
}
