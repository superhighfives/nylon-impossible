//
//  ContentView+Actions.swift
//  Nylon Impossible
//
//  What the shell does in response to taps, drops and the composer, split
//  from ContentView.swift to keep each file to a readable length.
//

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

    func drop(_ page: Page, _ id: UUID) {
        guard let todo = todos.first(where: { $0.id == id }), let list = timeList(page) else { return }
        actions.move(todo, toList: list.id)
    }

    func add(_ listId: String?, _ parseDates: Bool) {
        let text = viewModel.newTaskText
        viewModel.newTaskText = ""
        let created = actions.add(draft: text, to: listId, parseDates: parseDates, userId: authService.userId)
        noteAdded(created, to: listId)
        guard !created.isEmpty, let listId, listId != currentListId else { return }
        let name = orderedLists.first { $0.id == listId }?.name ?? "List"
        let message = created.count > 1 ? "\(created.count) added to \(name)" : "Added to \(name)"
        let lists = orderedLists
        actions.toasts.show(message, actionLabel: "View", action: { [viewModel] in
            viewModel.show(listId: listId, in: lists)
        })
    }

    /// Put the overnight note away for good.
    func dismissOvernight() {
        guard let sweep = preferences.lastSweep else { return }
        overnightDismissedAt = sweep.atString
    }

    /// Adding anything to Today retires the overnight note.
    func noteAdded(_ created: [TodoItem], to listId: String?) {
        guard !created.isEmpty, overnightText != nil else { return }
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
            actions.toasts.show("Couldn’t create the list", action: nil)
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
                actions.toasts.show("Couldn’t save the new order", action: nil)
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
                actions.toasts.show("Couldn’t rename the list", action: nil)
            }
        }
    }

    func commitDeleteList() {
        guard let list = deletingList, let apiService = syncService.apiService else { return }
        Task {
            do {
                try await viewModel.deleteList(list, apiService: apiService, context: modelContext)
                syncService.syncAfterAction()
            } catch {
                actions.toasts.show("Couldn’t delete the list", action: nil)
            }
        }
    }

    func signOut() {
        showsAccount = false
        actions.flush()
        Task { await authService.signOut() }
    }

    /// The Home Screen "New Task" quick action: focus the composer on the
    /// list in view (Today, from the Lists index).
    func performPendingQuickAction() {
        guard let action = QuickActionService.shared.take() else { return }
        switch action {
        case .newTask:
            if currentListId == nil { viewModel.page = .today }
            focusComposer = true
        }
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
        case .today, .overnight: viewModel.page = .today
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
        case .detail, .done, .settings:
            Task {
                try? await Task.sleep(for: .milliseconds(400))
                switch route {
                case .detail:
                    viewModel.page = .thisWeek
                    if let todo = todos.first(where: { !(subtasksByParent[$0.id] ?? []).isEmpty }) {
                        detailDetent = .large
                        detailTodo = todo
                    }
                case .done:
                    accountDetent = .large
                    accountPath = [.done]
                    showsAccount = true
                default:
                    accountDetent = .large
                    accountPath = [.settings]
                    showsAccount = true
                }
            }
        }
    }
}
