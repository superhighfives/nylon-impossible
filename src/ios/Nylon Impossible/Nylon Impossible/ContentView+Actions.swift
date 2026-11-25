//
//  ContentView+Actions.swift
//  Nylon Impossible
//
//  What the shell does in response to taps and the composer, split
//  from ContentView.swift to keep each file to a readable length.
//

#if os(iOS)
import SwiftData
import SwiftUI

extension ContentView {
    // MARK: - Actions

    func select(_ page: Page) {
        if page == .lists, viewModel.page == .lists, viewModel.openCollectionId != nil {
            closeCollection()
            return
        }
        viewModel.page = page
    }

    func open(_ todo: TodoItem) {
        detailDetent = .medium
        detailTodo = todo
    }

    func closeCollection() {
        withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            viewModel.openCollectionId = nil
        }
    }

    func add(_ listId: String?, _ parseDates: Bool) {
        let text = viewModel.newTaskText
        viewModel.newTaskText = ""
        let created = actions.add(draft: text, to: listId, parseDates: parseDates, userId: authService.userId)
        noteAdded(created, to: listId)
        guard !created.isEmpty, let listId, listId != currentListId else { return }
        let name = orderedLists.first { $0.id == listId }?.nameInSentence ?? "List"
        let message = ToastCopy.added(count: created.count, listName: name)
        let lists = orderedLists
        actions.toasts.show(message, actionLabel: "View", action: { [viewModel] in
            viewModel.show(listId: listId, in: lists)
        })
    }

    /// The pill's text: the first todo in the list they moved to (This week
    /// if anything went there, else Someday): that page.
    func seeOvernight() {
        let kind: SystemListKind = (preferences.lastSweep?.movedToThisWeek ?? 0) > 0 ? .thisWeek : .someday
        if let page = Page(systemKind: kind) { select(page) }
    }

    /// Put the overnight note away for good.
    func dismissOvernight() {
        guard let sweep = preferences.lastSweep else { return }
        overnightDismissedAt = sweep.atString
    }

    /// Adding anything to Today retires the overnight note.
    func noteAdded(_ created: [TodoItem], to listId: String?) {
        guard !created.isEmpty, overnightLine != nil else { return }
        let today = timeList(.today)?.id.lowercased()
        if listId == nil || listId?.lowercased() == today { dismissOvernight() }
    }

    func createList(_ name: String) async -> Bool {
        guard let apiService = syncService.apiService else { return false }
        do {
            let list = try await viewModel.createList(
                name: name,
                apiService: apiService,
                context: modelContext,
                existingLists: orderedLists
            )
            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                viewModel.openCollectionId = list.id
            }
            syncService.syncAfterAction()
            return true
        } catch {
            actions.toasts.showError("Couldn’t create the list")
            return false
        }
    }

    func reorderCollections(from source: IndexSet, to destination: Int) {
        guard let apiService = syncService.apiService else { return }
        var ordered = collections
        let moved = source.map { ordered[$0] }
        ordered.move(fromOffsets: source, toOffset: destination)
        guard let list = moved.first, let index = ordered.firstIndex(where: { $0.id == list.id }) else { return }
        let prev = index > 0 ? ordered[index - 1] : nil
        let next = index < ordered.count - 1 ? ordered[index + 1] : nil
        Task {
            do {
                try await viewModel.reorderList(list, prev: prev, next: next, apiService: apiService)
                syncService.syncAfterAction()
            } catch {
                actions.toasts.showError("Couldn’t save the new order")
            }
        }
    }

    func commitRename() {
        guard let list = renamingList, let apiService = syncService.apiService else { return }
        let name = renameText
        Task {
            do {
                try await viewModel.renameList(list, name: name, apiService: apiService)
                syncService.syncAfterAction()
            } catch {
                actions.toasts.showError("Couldn’t rename the list")
            }
        }
    }

    /// Delete one of your lists straight away, with Undo (no confirmation).
    /// It and its todos hide now; the delete goes to the server when the
    /// toast does.
    func deleteListWithUndo(_ list: TodoListModel) {
        let count = todos.filter {
            $0.parentId == nil && !$0.isSoftDeleted && $0.listKey?.lowercased() == list.id.lowercased()
        }.count
        actions.deleteList(list, todoCount: count) { [syncService, viewModel, modelContext, actions] finished in
            // No API (DEBUG screen routes, tests): fail like a network error
            // does, so the toast that said "Deleted" isn't silently undone.
            guard let apiService = syncService.apiService else {
                actions.toasts.showError("Couldn’t delete the list")
                return finished()
            }
            Task {
                do {
                    try await viewModel.deleteList(list, apiService: apiService, context: modelContext)
                    syncService.syncAfterAction()
                } catch {
                    actions.toasts.showError("Couldn’t delete the list")
                }
                finished()
            }
        }
        // Hidden first, then out of the way.
        if viewModel.openCollectionId == list.id { viewModel.openCollectionId = nil }
    }

    func signOut() {
        showsAccount = false
        actions.flush()
        Task { await authService.signOut() }
    }

    /// Follow a route from outside — `nylon://add?list=…`, the "New todo"
    /// quick action, the widget's "+" or the Control Center control: the
    /// named list, with the composer focused. Anything covering the composer
    /// (the detail sheet, the account sheet) is put away first.
    func performPendingRoute() {
        guard let link = QuickActionService.shared.take() else { return }
        switch link {
        case .add(let target):
            openComposer(DeepLinkDestination.resolve(target, lists: orderedLists))
        }
    }

    func openComposer(_ destination: DeepLinkDestination) {
        detailTodo = nil
        showsAccount = false
        chosenListId = nil
        viewModel.openCollectionId = destination.collectionId
        viewModel.page = destination.page
        focusComposer = true
    }

    func scheduleMidnightTicks() async {
        while !Task.isCancelled {
            let now = Date()
            guard let nextMidnight = Calendar.current.nextDate(
                after: now,
                matching: DateComponents(hour: 0, minute: 0, second: 0),
                matchingPolicy: .nextTime
            ) else { return }
            try? await Task.sleep(for: .seconds(nextMidnight.timeIntervalSince(now) + 1))
            if Task.isCancelled { return }
            midnightTick += 1
        }
    }

    /// DEBUG builds can open straight to a state for screenshots; see
    /// `ScreenRoute`. A no-op otherwise.
    func applyScreenRoute() {
        guard let route = screenRoute else { return }
        switch route {
        case .today, .overnight, .loading, .empty, .syncerror, .perf: viewModel.page = .today
        case .toast, .toasterror:
            viewModel.page = .today
            #if DEBUG
            actions.toasts.showForScreenshot(route)
            #endif
        case .link, .share, .sharetext, .widgets, .signin, .menubar, .feedback: break
        case .week: viewModel.page = .thisWeek
        case .someday: viewModel.page = .someday
        case .lists: viewModel.page = .lists
        case .collection:
            viewModel.page = .lists
            viewModel.openCollectionId = collections.first?.id
        case .composer:
            viewModel.page = .thisWeek
            viewModel.newTaskText = "Call the dentist friday"
            focusComposer = true
        case .detail, .notesmax, .notescode, .notescodeedit, .done, .settings:
            Task {
                try? await Task.sleep(for: .milliseconds(400))
                switch route {
                case .detail, .notesmax, .notescode, .notescodeedit:
                    viewModel.page = .thisWeek
                    let subtasks = subtasksByParent
                    if let todo = todos.first(where: { !(subtasks[$0.id] ?? []).isEmpty }) {
                        detailDetent = .large
                        detailTodo = todo
                    }
                case .done:
                    viewModel.page = .done
                default:
                    accountDetent = .large
                    accountPath = [.settings]
                    showsAccount = true
                }
            }
        }
    }
}
#endif
