//
//  TodoActions.swift
//  Nylon Impossible
//
//  Everything a row, the context menu, the composer and the detail sheet can
//  do to a todo, in one place so each gets the same toast and the same Undo.
//
//  - Done holds the checked row for ~400ms, then lets it go and toasts
//    "Done · Undo". A repeat's next occurrence goes where its new due date
//    puts it (`RecurrenceHelper.placement`) and toasts "Done · next Mon",
//    adding ", in This Week" when that's a different list.
//  - Delete hides the row at once but only deletes when its toast goes, so
//    Undo never has to resurrect something the server already dropped.
//  - Moves and restores toast with an Undo that puts every field back.
//
//  The completion rules themselves stay in `TodoCompletionService`, shared with
//  the widget; this only decides timing and what Undo restores.
//

import Foundation
import Observation
import SwiftData
import SwiftUI

/// The fields a done, move or restore can change, so Undo can put them back
/// exactly — including the pin a completion clears and the subtasks it closes.
struct TodoSnapshot {
    let isCompleted: Bool
    let completedAt: Date?
    let dueDate: Date?
    let listKey: String?
    let listEnteredAt: Date?
    let pinned: Bool
    let position: String
    let children: [UUID: Bool]

    init(_ todo: TodoItem, children: [TodoItem] = []) {
        isCompleted = todo.isCompleted
        completedAt = todo.completedAt
        dueDate = todo.dueDate
        listKey = todo.listKey
        listEnteredAt = todo.listEnteredAt
        pinned = todo.pinned
        position = todo.position
        self.children = Dictionary(children.map { ($0.id, $0.isCompleted) }, uniquingKeysWith: { first, _ in first })
    }

    func restore(_ todo: TodoItem, children: [TodoItem] = []) {
        todo.isCompleted = isCompleted
        todo.completedAt = completedAt
        todo.dueDate = dueDate
        todo.listKey = listKey
        todo.listEnteredAt = listEnteredAt
        todo.pinned = pinned
        todo.position = position
        todo.markModified()
        for child in children {
            guard let was = self.children[child.id], was != child.isCompleted else { continue }
            child.isCompleted = was
            child.markModified()
        }
    }
}

@MainActor
@Observable
final class TodoActions {
    let toasts = ToastCenter()
    let viewModel: TodoViewModel

    /// Checked rows waiting out their hold before they leave.
    private(set) var holding: Set<UUID> = []
    /// Rows fading out under Reduce Motion, which drops the collapse.
    private(set) var fading: Set<UUID> = []
    /// Deleted rows whose toast is still up. Hidden, not yet deleted.
    private(set) var pendingDeletes: Set<UUID> = []

    @ObservationIgnored var reduceMotion = false
    @ObservationIgnored var holdDuration: Duration = Theme.Phone.doneHold
    @ObservationIgnored private var holdTasks: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var context: ModelContext?
    @ObservationIgnored private var container: ModelContainer?
    @ObservationIgnored private var onMutate: () -> Void = {}

    init(viewModel: TodoViewModel? = nil) {
        self.viewModel = viewModel ?? TodoViewModel()
    }

    /// Wire up the store and the after-change hook (a sync, in the app).
    func configure(context: ModelContext, onMutate: @escaping () -> Void) {
        self.context = context
        // A context doesn't keep its container alive; a hold or a toast can
        // outlive whoever made it, so this does.
        self.container = context.container
        self.onMutate = onMutate
    }

    // MARK: - Reads

    func allTodos() -> [TodoItem] {
        (try? context?.fetch(FetchDescriptor<TodoItem>())) ?? []
    }

    func allLists() -> [TodoListModel] {
        (try? context?.fetch(FetchDescriptor<TodoListModel>())) ?? []
    }

    func children(of todo: TodoItem) -> [TodoItem] {
        allTodos().filter { $0.parentId == todo.id && !$0.isSoftDeleted }
    }

    func listName(_ listId: String?) -> String {
        guard let listId else { return "Today" }
        return allLists().first { $0.id.lowercased() == listId.lowercased() }?.name ?? "List"
    }

    /// Whether a row is drawn checked: held, or a repeat already done today.
    func isChecked(_ todo: TodoItem) -> Bool {
        holding.contains(todo.id) || todo.isCompleted
    }

    // MARK: - Adding

    /// Add what the composer holds: one todo per line, in order, each split so
    /// overlong text keeps its full words in notes.
    @discardableResult
    func add(draft: String, to listId: String?, parseDates: Bool, userId: String?) -> [TodoItem] {
        guard let context else { return [] }
        var created: [TodoItem] = []
        // Each create lands above the list's first todo, so adding the lines
        // last-to-first leaves them in the order they were typed.
        for entry in TodoText.entries(fromDraft: draft).reversed() {
            guard let todo = TaskCreationService.createSmart(
                text: entry.title,
                userId: userId,
                context: context,
                allTodos: allTodos(),
                listId: listId,
                parseDate: parseDates
            ) else { continue }
            if let notes = entry.notes { todo.itemNotes = notes }
            created.insert(todo, at: 0)
        }
        guard !created.isEmpty else { return [] }
        save()
        onMutate()
        return created
    }

    // MARK: - Done

    /// The checkbox. A second tap during the hold changes your mind.
    func toggleDone(_ todo: TodoItem) {
        if let task = holdTasks.removeValue(forKey: todo.id) {
            task.cancel()
            holding.remove(todo.id)
            return
        }
        holding.insert(todo.id)
        let hold = holdDuration
        holdTasks[todo.id] = Task { [weak self] in
            try? await Task.sleep(for: hold)
            guard !Task.isCancelled else { return }
            await self?.finishHold(todo)
        }
    }

    private func finishHold(_ todo: TodoItem) async {
        holdTasks[todo.id] = nil
        let repeats = todo.recurrence != nil && todo.dueDate != nil
        if reduceMotion && !repeats {
            withAnimation(.linear(duration: Theme.Motion.fast)) { _ = fading.insert(todo.id) }
            try? await Task.sleep(for: .seconds(Theme.Motion.fast))
            commitDone(todo, animated: false)
        } else {
            commitDone(todo, animated: !reduceMotion)
        }
    }

    /// Mark done now (the end of the hold), and toast with an Undo.
    func commitDone(_ todo: TodoItem, animated: Bool = false) {
        let children = children(of: todo)
        let snapshot = TodoSnapshot(todo, children: children)
        let apply = {
            // A repeat already done today comes back unchecked with its next
            // date, so checking it again means the occurrence after that.
            if !todo.isCompleted, todo.isEffectivelyCompleted { todo.completedAt = nil }
            TodoCompletionService.toggle(todo, allTodos: self.allTodos(), lists: self.allLists())
            self.holding.remove(todo.id)
            self.fading.remove(todo.id)
        }
        if animated {
            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base), apply)
        } else {
            apply()
        }
        save()
        onMutate()

        let text: String
        if !todo.isCompleted, todo.recurrence != nil, let next = todo.dueDate {
            let label = DueLabel.text(for: next).text
            let moved = todo.listKey?.lowercased() != snapshot.listKey?.lowercased()
            text = moved
                ? "Done · next \(label), in \(listName(todo.listKey))"
                : "Done · next \(label)"
        } else {
            text = "Done"
        }
        toasts.show(text, action: { [weak self] in
            self?.undo(snapshot, todo: todo)
        })
    }

    /// Put a done todo back in its list, from the Done history.
    func restoreFromDone(_ todo: TodoItem) {
        let children = children(of: todo)
        let snapshot = TodoSnapshot(todo, children: children)
        TodoCompletionService.toggle(todo, allTodos: allTodos(), lists: allLists())
        save()
        onMutate()
        toasts.show("Back in \(listName(todo.listKey))", action: { [weak self] in
            self?.undo(snapshot, todo: todo)
        })
    }

    private func undo(_ snapshot: TodoSnapshot, todo: TodoItem) {
        let children = children(of: todo)
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            snapshot.restore(todo, children: children)
        }
        save()
        onMutate()
    }

    // MARK: - Delete

    /// Hide now, delete when the toast goes. Undo just un-hides.
    func delete(_ todo: TodoItem) {
        let id = todo.id
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            _ = pendingDeletes.insert(id)
        }
        toasts.show(
            "Deleted",
            onExpire: { [weak self] in self?.commitDelete(todo) },
            action: { [weak self] in
                guard let self else { return }
                withAnimation(self.reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                    _ = self.pendingDeletes.remove(id)
                }
            }
        )
    }

    private func commitDelete(_ todo: TodoItem) {
        guard let context, pendingDeletes.remove(todo.id) != nil else { return }
        viewModel.deleteTodo(todo, context: context)
        save()
        onMutate()
    }

    /// Commit anything a toast is holding back — leaving the app, signing out.
    func flush() {
        toasts.expire()
    }

    // MARK: - Move and pin

    /// Move to another list. `announce` toasts with Undo (the context menu and
    /// drops); the detail sheet's own List chip already shows where it went.
    func move(_ todo: TodoItem, toList listId: String, announce: Bool = true) {
        guard todo.listKey?.lowercased() != listId.lowercased() else { return }
        let snapshot = TodoSnapshot(todo)
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            viewModel.moveTodoToList(todo, to: listId, allTodos: allTodos())
        }
        save()
        onMutate()
        guard announce else { return }
        toasts.show("Moved to \(listName(listId))", action: { [weak self] in
            self?.undo(snapshot, todo: todo)
        })
    }

    func togglePin(_ todo: TodoItem) {
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            viewModel.togglePinned(todo)
        }
        save()
        onMutate()
    }

    /// After an in-place edit (title, notes, due, repeat). Saves locally now;
    /// the hook decides how eagerly to sync.
    func edited() {
        save()
        onMutate()
    }

    private func save() {
        do {
            try context?.save()
        } catch {
            // The row already shows the change; say it didn't stick rather
            // than let it vanish on the next launch without syncing.
            print("[TodoActions] Save failed: \(error)")
            toasts.show("Couldn’t save that change", action: nil)
        }
    }
}
