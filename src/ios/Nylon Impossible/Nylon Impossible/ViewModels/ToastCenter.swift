//
//  ToastCenter.swift
//  Nylon Impossible
//
//  The one toast on screen: "Done · Undo", "Deleted · Undo", "Added to
//  Someday · View", "Undone: Done". A new toast replaces the old one, and
//  replacing (or timing out) runs the old one's `onExpire`.
//

import Foundation
import Observation

/// Toast wording shared by more than one place, so it can't drift.
enum ToastCopy {
    /// "Added to someday", "3 todos added to Groceries", "Added to this week
    /// · due Fri": the same words as the web composer and Gmail (shared's
    /// `addedToast`). `listName` reads mid-sentence (`nameInSentence`), and
    /// `dueLabel` is the row's due label (`DueLabel.text`) when a day was
    /// given.
    static func added(count: Int, listName: String, dueLabel: String? = nil) -> String {
        let added = count > 1 ? "\(count) todos added to \(listName)" : "Added to \(listName)"
        guard let dueLabel else { return added }
        return "\(added) · due \(dueInSentence(dueLabel))"
    }

    /// A due label mid-sentence: "today", "tomorrow"; weekdays and months
    /// keep their capitals ("Fri", "Mar 3").
    static func dueInSentence(_ label: String) -> String {
        ["Today", "Tomorrow", "Yesterday"].contains(label) ? label.lowercased() : label
    }
}

@MainActor
@Observable
final class ToastCenter {
    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let text: String
        /// "Undo" or "View"; nil for a toast with nothing to tap.
        let actionLabel: String?
        /// A failure ("Couldn’t …"): the red pill with the alert icon.
        var isError = false
    }

    private(set) var current: Toast?
    @ObservationIgnored private var action: (() -> Void)?
    @ObservationIgnored private var onExpire: (() -> Void)?
    /// Counts the current toast down to its expiry. Awaiting it waits for
    /// the timeout itself rather than for a guessed amount of wall time.
    @ObservationIgnored private(set) var timer: Task<Void, Never>?
    @ObservationIgnored var duration: Duration = Theme.Phone.toastDuration
    /// How long a toast with an action stays up for someone on VoiceOver or
    /// Switch Control: long enough to hear it and reach Undo (or two-finger
    /// double-tap it), which five seconds isn't.
    @ObservationIgnored var assistiveDuration: Duration = .seconds(15)
    /// Whether an assistive technology that moves focus one element at a
    /// time is running. A closure so tests can say yes.
    @ObservationIgnored var usesAssistiveTech: () -> Bool = {
        AssistiveTechnology.isRunning
    }

    /// The timeout for the next toast.
    func timeout(hasAction: Bool) -> Duration {
        guard hasAction, usesAssistiveTech() else { return duration }
        return max(duration, assistiveDuration)
    }

    /// Show a toast. A trailing closure is the action (Undo, View);
    /// `onExpire` runs instead if the toast times out or is replaced.
    /// `isError` marks a failure ("Couldn’t …"), which shows red.
    func show(
        _ text: String,
        actionLabel: String? = "Undo",
        isError: Bool = false,
        onExpire: (() -> Void)? = nil,
        action: (() -> Void)? = nil
    ) {
        expire()
        let toast = Toast(text: text, actionLabel: action == nil ? nil : actionLabel, isError: isError)
        current = toast
        self.action = action
        self.onExpire = onExpire
        let duration = timeout(hasAction: action != nil)
        timer = Task { [weak self] in
            try? await Task.sleep(for: duration)
            guard !Task.isCancelled else { return }
            self?.expire(ifCurrent: toast.id)
        }
    }

    /// A failure: "Couldn’t save that change", with nothing to tap.
    func showError(_ text: String) {
        show(text, isError: true, action: nil)
    }

    /// An undo or redo from the history: "Undone: Done", "Redone: Moved to
    /// this week", or "Already deleted", with nothing to tap.
    func show(_ step: UndoHistory.Step, _ outcome: UndoHistory.Outcome) {
        switch outcome {
        case .done(let entry):
            show("\(step == .undo ? "Undone" : "Redone"): \(entry.text)", action: nil)
        case .gone:
            show("Already deleted", action: nil)
        }
    }

    /// The toast's button: run its action instead of its expiry.
    func performAction() {
        let action = action
        clear()
        action?()
    }

    /// Let the current toast go now, committing whatever it was holding back.
    func expire() {
        let onExpire = onExpire
        clear()
        onExpire?()
    }

    private func expire(ifCurrent id: UUID) {
        guard current?.id == id else { return }
        expire()
    }

    private func clear() {
        timer?.cancel()
        timer = nil
        current = nil
        action = nil
        onExpire = nil
    }
}
