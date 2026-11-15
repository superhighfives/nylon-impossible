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
//    adding ", in This week" when that's a different list.
//  - Delete hides the row at once but only deletes after the toast's time,
//    so Undo never has to resurrect something the server already dropped.
//  - Moves and restores toast with an Undo that puts every field back.
//  - Each of those goes into the window's `UndoHistory`, so ⌘Z steps back
//    through the last 20 and ⇧⌘Z forward again. The toast's Undo is the same
//    as ⌘Z for its own action. A delete leaves the history once it's sent.
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
    /// The last 20 actions with Undo, on the window's undo manager.
    let history = UndoHistory()

    /// Checked rows waiting out their hold before they leave.
    private(set) var holding: Set<UUID> = []
    /// Rows fading out under Reduce Motion, which drops the collapse.
    private(set) var fading: Set<UUID> = []
    /// Deleted rows waiting out their time. Hidden, not yet deleted.
    private(set) var pendingDeletes: Set<UUID> = []
    /// Deleted lists (by id) waiting out their time, or whose delete is
    /// still on its way to the server. Hidden, with their todos.
    private(set) var pendingListDeletes: Set<String> = []

    @ObservationIgnored var reduceMotion = false
    @ObservationIgnored var holdDuration: Duration = Theme.Phone.doneHold
    @ObservationIgnored private var holdTasks: [UUID: Task<Void, Never>] = [:]
    /// What sends each waiting delete when its time is up, by todo id or
    /// "list:" and the list's id. `flush` sends them all now.
    @ObservationIgnored private var deleteSends: [String: () -> Void] = [:]
    /// Counts each waiting delete down. Awaiting one waits for the send.
    @ObservationIgnored private(set) var deleteTimers: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var context: ModelContext?
    @ObservationIgnored private var container: ModelContainer?
    @ObservationIgnored private var onMutate: () -> Void = {}
    /// Where the context menu's "Move to" recents come from.
    @ObservationIgnored var recentLists = RecentMoveLists()

    init(viewModel: TodoViewModel? = nil) {
        self.viewModel = viewModel ?? TodoViewModel()
        history.announce = { [toasts] step, outcome in toasts.show(step, outcome) }
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

    /// A list's name inside a toast: "Moved to this week", "Moved to Groceries".
    func listNameInSentence(_ listId: String?) -> String {
        guard let listId else { return SystemListKind.today.nameInSentence }
        return allLists().first { $0.id.lowercased() == listId.lowercased() }?.nameInSentence ?? "List"
    }

    /// Whether a todo is still there to change: not deleted here or on
    /// another device, and not waiting on its delete.
    func exists(_ todo: TodoItem) -> Bool {
        !todo.isDeleted && todo.modelContext != nil && !todo.isSoftDeleted && !pendingDeletes.contains(todo.id)
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
    ///
    /// Returns the hold — the wait, the fade and the commit — so a caller can
    /// await the outcome instead of guessing how long it takes; nil when the
    /// tap cancelled one.
    @discardableResult
    func toggleDone(_ todo: TodoItem) -> Task<Void, Never>? {
        if let task = holdTasks.removeValue(forKey: todo.id) {
            task.cancel()
            holding.remove(todo.id)
            return nil
        }
        holding.insert(todo.id)
        let hold = holdDuration
        let task = Task { [weak self] in
            try? await Task.sleep(for: hold)
            guard !Task.isCancelled else { return }
            await self?.finishHold(todo)
        }
        holdTasks[todo.id] = task
        return task
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
                ? "Done · next \(label), in \(listNameInSentence(todo.listKey))"
                : "Done · next \(label)"
        } else {
            text = "Done"
        }
        record(text, todo: todo, before: snapshot)
    }

    /// Put a done todo back in its list, from the Done history.
    func restoreFromDone(_ todo: TodoItem) {
        let children = children(of: todo)
        let snapshot = TodoSnapshot(todo, children: children)
        TodoCompletionService.toggle(todo, allTodos: allTodos(), lists: allLists())
        save()
        onMutate()
        record("Back in \(listNameInSentence(todo.listKey))", todo: todo, before: snapshot)
    }

    // MARK: - History

    /// Into the history, with its toast: Undo puts back `before`, Redo what
    /// the todo is now. `onUndo` and `onRedo` run after each.
    private func record(
        _ text: String, todo: TodoItem, before: TodoSnapshot,
        onUndo: (() -> Void)? = nil, onRedo: (() -> Void)? = nil
    ) {
        let after = TodoSnapshot(todo, children: children(of: todo))
        record(UndoHistory.Entry(
            text: text,
            undo: { [weak self] in
                guard let self, self.exists(todo) else { return false }
                self.restore(before, todo: todo)
                onUndo?()
                return true
            },
            redo: { [weak self] in
                guard let self, self.exists(todo) else { return false }
                self.restore(after, todo: todo)
                onRedo?()
                return true
            }
        ))
    }

    /// Put an action into the history and toast it, with an Undo that's the
    /// same as ⌘Z for it.
    private func record(_ entry: UndoHistory.Entry) {
        history.push(entry)
        toasts.show(entry.text, action: { [weak self] in self?.history.undo(entry) })
    }

    private func restore(_ snapshot: TodoSnapshot, todo: TodoItem) {
        let children = children(of: todo)
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            snapshot.restore(todo, children: children)
        }
        save()
        onMutate()
    }

    // MARK: - Delete

    /// Hide now, delete when the toast's time is up. Undo just un-hides, and
    /// Redo hides it again for a fresh stretch.
    func delete(_ todo: TodoItem) {
        let id = todo.id
        let key = id.uuidString
        // Weak: the entry's redo holds `hide`, so a strong one would keep
        // both alive for the window's life.
        weak var entry: UndoHistory.Entry?
        let hide = { [weak self] in
            guard let self else { return }
            self.setHidden { _ = self.pendingDeletes.insert(id) }
            self.schedule(key) {
                if let entry { self.history.drop(entry) }
                self.commitDelete(todo)
            }
        }
        let deleted = UndoHistory.Entry(
            text: "Deleted",
            undo: { [weak self] in
                // Leaving the app sends waiting deletes, so this one may have
                // gone while its toast was still up.
                guard let self, self.cancelDelete(key) else { return false }
                self.setHidden { _ = self.pendingDeletes.remove(id) }
                return true
            },
            redo: { [weak self] in
                guard let self, self.exists(todo) else { return false }
                hide()
                return true
            }
        )
        entry = deleted
        hide()
        record(deleted)
    }

    private func commitDelete(_ todo: TodoItem) {
        guard let context, pendingDeletes.remove(todo.id) != nil else { return }
        viewModel.deleteTodo(todo, context: context)
        save()
        onMutate()
    }

    /// Delete one of your lists straight away, with Undo: it and its todos
    /// hide now, and `commit` deletes it when the toast's time is up.
    /// `commit` calls its argument when it's done (or failed), which un-hides
    /// the list.
    func deleteList(
        _ list: TodoListModel,
        todoCount: Int,
        commit: @escaping (_ finished: @escaping () -> Void) -> Void
    ) {
        let id = list.id
        // Once per list: its delete is already waiting.
        guard !pendingListDeletes.contains(id) else { return }
        let key = "list:\(id)"
        weak var entry: UndoHistory.Entry?
        let hide = { [weak self] in
            guard let self else { return }
            self.setHidden { _ = self.pendingListDeletes.insert(id) }
            self.schedule(key) {
                if let entry { self.history.drop(entry) }
                commit { [weak self] in _ = self?.pendingListDeletes.remove(id) }
            }
        }
        let deleted = UndoHistory.Entry(
            text: todoCount > 0
                ? "Deleted “\(list.name)” and \(todoCount) \(todoCount == 1 ? "todo" : "todos")"
                : "Deleted “\(list.name)”",
            undo: { [weak self] in
                guard let self, self.cancelDelete(key) else { return false }
                self.setHidden { _ = self.pendingListDeletes.remove(id) }
                return true
            },
            redo: { [weak self] in
                // Gone if another device deleted it in the meantime.
                guard let self, !self.pendingListDeletes.contains(id),
                      self.allLists().contains(where: { $0.id == id }) else { return false }
                hide()
                return true
            }
        )
        entry = deleted
        hide()
        record(deleted)
    }

    private func setHidden(_ change: () -> Void) {
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base), change)
    }

    /// Send a delete when a toast with Undo would time out.
    private func schedule(_ key: String, send: @escaping () -> Void) {
        deleteTimers[key]?.cancel()
        deleteSends[key] = send
        let wait = toasts.timeout(hasAction: true)
        deleteTimers[key] = Task { [weak self] in
            try? await Task.sleep(for: wait)
            guard !Task.isCancelled else { return }
            self?.sendDelete(key)
        }
    }

    private func sendDelete(_ key: String) {
        deleteTimers.removeValue(forKey: key)?.cancel()
        deleteSends.removeValue(forKey: key)?()
    }

    /// Stop a delete that hasn't been sent. False if it already has.
    private func cancelDelete(_ key: String) -> Bool {
        deleteTimers.removeValue(forKey: key)?.cancel()
        return deleteSends.removeValue(forKey: key) != nil
    }

    /// Send every delete that's waiting — leaving the app, signing out.
    func flush() {
        toasts.expire()
        for key in Array(deleteSends.keys) { sendDelete(key) }
    }

    // MARK: - Move and pin

    /// Move to another list. `announce` toasts with Undo (the context menu and
    /// drops); the detail sheet's own List chip already shows where it went.
    /// `position` places it (a board drop); without one it goes last.
    /// `onUndo` runs after an Undo has put it back, `onRedo` after a Redo
    /// has moved it again.
    func move(
        _ todo: TodoItem, toList listId: String, position: String? = nil, announce: Bool = true,
        onUndo: (() -> Void)? = nil, onRedo: (() -> Void)? = nil
    ) {
        guard todo.listKey?.lowercased() != listId.lowercased() else { return }
        let snapshot = TodoSnapshot(todo)
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            viewModel.moveTodoToList(todo, to: listId, allTodos: allTodos(), position: position)
        }
        save()
        onMutate()
        // Only collections are ever shown as recents; time lists would just
        // push them out of the capped history.
        if allLists().first(where: { $0.id.lowercased() == listId.lowercased() })?.isSystem == false {
            recentLists.record(listId)
        }
        guard announce else { return }
        record("Moved to \(listNameInSentence(listId))", todo: todo, before: snapshot, onUndo: onUndo, onRedo: onRedo)
    }

    func togglePin(_ todo: TodoItem) {
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            viewModel.togglePinned(todo)
        }
        save()
        onMutate()
    }

    /// Set or clear the due day. A repeat is anchored on its due day, so
    /// clearing the day ends it.
    func setDue(_ todo: TodoItem, _ date: Date?) {
        todo.dueDate = date
        if date == nil { todo.recurrence = nil }
        todo.markModified()
        edited()
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
