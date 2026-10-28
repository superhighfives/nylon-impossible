//
//  AddTaskIntent.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import AppIntents
#if os(iOS)
import BackgroundTasks
#endif
import SwiftData

/// "Add todo" for Siri, Shortcuts and Spotlight.
///
/// The Swift type, its `task` parameter and `TaskTitle` keep their pre-"todo"
/// names on purpose: App Intents identifies an intent and its parameters by
/// those identifiers, so renaming them would orphan every Shortcut someone
/// has already built on this one. Everything a person sees says "todo".
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add todo"
    static var description = IntentDescription("Add a todo to Nylon. Say when it’s due — “pay rent tomorrow” — and the due day is set.")

    /// Don't open the app when running via Siri - just confirm and return
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Todo", requestValueDialog: "What’s the todo?")
    var task: TaskTitle

    /// Today when left out, the way the composer defaults to the list in view.
    @Parameter(title: "List")
    var list: TodoListEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$task) to \(\.$list)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let container = SharedModelContainer.shared
        let context = ModelContext(container)

        let sharedDefaults = UserDefaults(suiteName: BackgroundSyncService.appGroupSuiteName)

        // Get current userId from Keychain/UserDefaults if available
        // For Siri, we may not have auth context, so userId can be nil
        let userId: String? = sharedDefaults?.string(forKey: BackgroundSyncService.userIdKey)

        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
        let lists = (try? context.fetch(FetchDescriptor<TodoListModel>())) ?? []
        let destination = Self.resolve(list?.target ?? .today, lists: lists)

        // The composer's path: a URL becomes a link, and a date at the end of
        // what was said ("…tomorrow") becomes the due day.
        guard let todo = TaskCreationService.createSmart(
            text: task.title,
            userId: userId,
            context: context,
            allTodos: allTodos,
            listId: destination.listId
        ) else {
            return .result(dialog: "There was nothing to add.")
        }

        WidgetRefresh.reload()

        // Attempt an immediate sync to the server so the todo is visible on other devices
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

        let confirmation = Self.confirmation(listName: destination.name, dueDate: todo.dueDate)
        return .result(dialog: IntentDialog(stringLiteral: confirmation))
    }

    /// Which list a todo goes in, and the name to confirm it with.
    ///
    /// A time list resolves by kind to this account's row. Before the first
    /// sync there is no row, so the todo is created without a list, which the
    /// server files in Today — and the confirmation says Today rather than
    /// promising a list it didn't reach. One of your lists that's gone
    /// (deleted since the Shortcut was made) falls back the same way.
    static func resolve(
        _ target: DeepLink.ListTarget,
        lists: [TodoListModel]
    ) -> (listId: String?, name: String) {
        switch target {
        case .today, .thisWeek, .someday:
            if let kind = target.systemKind, let list = lists.first(where: { $0.systemKind == kind }) {
                return (list.id, list.name)
            }
        case .list(let id):
            if let list = lists.first(where: { $0.id.caseInsensitiveCompare(id) == .orderedSame }) {
                return (list.id, list.name)
            }
        }
        let today = lists.first { $0.systemKind == .today }
        return (today?.id, today?.name ?? "Today")
    }

    /// "Added to This week · Due Fri", or "Added to Today" with no due day.
    static func confirmation(listName: String, dueDate: Date?, now: Date = Date()) -> String {
        guard let dueDate else { return "Added to \(listName)" }
        return "Added to \(listName) · \(DueLabel.chip(for: dueDate, now: now))"
    }

    /// iOS retries from a background task. A Mac has none; the intent runs
    /// in the app's process there, and the signal has it sync now.
    private func scheduleBackgroundSync() {
        #if os(macOS)
        StoreChangeSignal.post()
        #else
        let request = BGAppRefreshTaskRequest(identifier: BackgroundSyncService.backgroundSyncTaskIdentifier)
        request.earliestBeginDate = nil
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("[AddTaskIntent] Failed to schedule BGAppRefreshTask: \(error)")
        }
        #endif
    }
}
