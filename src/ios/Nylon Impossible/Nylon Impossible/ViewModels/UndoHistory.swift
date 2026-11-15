//
//  UndoHistory.swift
//  Nylon Impossible
//
//  The window's last 20 actions that offered Undo (Done, Move, Delete,
//  Delete list, Back in), so ⌘Z, Edit ▸ Undo and shake step back through
//  them, newest first, and ⇧⌘Z steps forward again. The same history as the
//  web board's `z` / ⇧Z (`undoHistory.ts`). In memory only: a relaunch
//  clears it.
//
//  Each action is registered on the window's undo manager with its own
//  target, so the cap and a sent delete can take out just that one, and the
//  menu is named after its toast: "Undo Done", "Redo Moved to this week".
//  Text fields keep their own typing undo on the same manager, so ⌘Z still
//  undoes whatever happened most recently.
//

import Foundation

@MainActor
final class UndoHistory {
    /// How many actions ⌘Z can step back through.
    static let limit = 20

    /// One action that offered Undo. `undo` and `redo` return false when the
    /// todo or list it acts on is gone, so there's nothing left to change.
    final class Entry {
        /// The action's own toast text: "Done", "Moved to this week".
        let text: String
        let undo: () -> Bool
        let redo: () -> Bool

        init(text: String, undo: @escaping () -> Bool, redo: @escaping () -> Bool) {
            self.text = text
            self.undo = undo
            self.redo = redo
        }
    }

    enum Step { case undo, redo }

    enum Outcome {
        case done(Entry)
        /// Its todo or list has been deleted (or the delete was sent).
        case gone(Entry)
    }

    /// Undoable actions, oldest first.
    private(set) var past: [Entry] = []
    /// Undone actions, the most recently undone last.
    private(set) var future: [Entry] = []
    /// The toast for each undo and redo: "Undone: Done", "Already deleted".
    var announce: (Step, Outcome) -> Void = { _, _ in }
    private(set) weak var undoManager: UndoManager?
    let limit: Int
    /// A toast's own Undo is running: its toast is the feedback, so only
    /// "Already deleted" is announced.
    private var fromToast = false

    init(limit: Int = UndoHistory.limit) {
        self.limit = limit
    }

    /// Register with this window's undo manager. Only actions from here on
    /// reach it.
    func attach(_ manager: UndoManager?) {
        guard manager !== undoManager else { return }
        for entry in past + future { undoManager?.removeAllActions(withTarget: entry) }
        undoManager = manager
    }

    /// A new action. It clears redo, and a 21st pushes out the oldest.
    func push(_ entry: Entry) {
        for undone in future { undoManager?.removeAllActions(withTarget: undone) }
        future = []
        past.append(entry)
        if past.count > limit { undoManager?.removeAllActions(withTarget: past.removeFirst()) }
        register(entry)
    }

    /// Take an action out of the history: a delete that's been sent.
    func drop(_ entry: Entry) {
        past.removeAll { $0 === entry }
        future.removeAll { $0 === entry }
        undoManager?.removeAllActions(withTarget: entry)
    }

    /// A toast's Undo button: the same as ⌘Z for its own action, so it can
    /// be redone. One that's already left the history says so.
    func undo(_ entry: Entry) {
        guard past.contains(where: { $0 === entry }) else {
            announce(.undo, .gone(entry))
            return
        }
        fromToast = true
        defer { fromToast = false }
        // Through the manager when it's the next thing ⌘Z would undo, so
        // ⇧⌘Z can redo it. Something typed since sits above it there; undo
        // it here then, and it stays redoable from the history alone.
        if let undoManager, undoManager.canUndo, past.last === entry, undoManager.undoActionName == entry.text {
            undoManager.undo()
            return
        }
        undoManager?.removeAllActions(withTarget: entry)
        report(.undo, reverse(entry))
    }

    // MARK: - Applying

    private func reverse(_ entry: Entry) -> Outcome {
        past.removeAll { $0 === entry }
        guard entry.undo() else {
            drop(entry)
            return .gone(entry)
        }
        future.append(entry)
        return .done(entry)
    }

    private func reapply(_ entry: Entry) -> Outcome {
        future.removeAll { $0 === entry }
        guard entry.redo() else {
            drop(entry)
            return .gone(entry)
        }
        past.append(entry)
        if past.count > limit { undoManager?.removeAllActions(withTarget: past.removeFirst()) }
        return .done(entry)
    }

    /// Put `entry` on the manager. Registered while the manager is undoing,
    /// it lands on the redo stack; while redoing, back on the undo stack.
    private func register(_ entry: Entry) {
        guard let undoManager else { return }
        // A manager that doesn't group by event (tests) needs a group open.
        let opensGroup = !undoManager.groupsByEvent && undoManager.groupingLevel == 0
        if opensGroup { undoManager.beginUndoGrouping() }
        undoManager.registerUndo(withTarget: entry) { [weak self] entry in
            MainActor.assumeIsolated { self?.managerRan(entry) }
        }
        undoManager.setActionName(entry.text)
        if opensGroup { undoManager.endUndoGrouping() }
    }

    private func managerRan(_ entry: Entry) {
        let redoing = undoManager?.isRedoing == true
        let outcome = redoing ? reapply(entry) : reverse(entry)
        if case .done = outcome { register(entry) }
        report(redoing ? .redo : .undo, outcome)
    }

    private func report(_ step: Step, _ outcome: Outcome) {
        if fromToast, case .done = outcome { return }
        announce(step, outcome)
    }
}
