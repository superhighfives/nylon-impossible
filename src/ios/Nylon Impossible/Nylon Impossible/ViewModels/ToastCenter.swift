//
//  ToastCenter.swift
//  Nylon Impossible
//
//  The one toast on screen: "Done · Undo", "Deleted · Undo", "Added to
//  Someday · View". A new toast replaces the old one, and replacing (or
//  timing out) runs the old one's `onExpire` — that's where a deferred delete
//  actually happens, so it can still be undone until the toast goes.
//

import Foundation
import Observation
import UIKit

@MainActor
@Observable
final class ToastCenter {
    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let text: String
        /// "Undo" or "View"; nil for a toast with nothing to tap.
        let actionLabel: String?
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
        UIAccessibility.isVoiceOverRunning || UIAccessibility.isSwitchControlRunning
    }

    /// The timeout for the next toast.
    func timeout(hasAction: Bool) -> Duration {
        guard hasAction, usesAssistiveTech() else { return duration }
        return max(duration, assistiveDuration)
    }

    /// Show a toast. A trailing closure is the action (Undo, View);
    /// `onExpire` runs instead if the toast times out or is replaced.
    func show(
        _ text: String,
        actionLabel: String? = "Undo",
        onExpire: (() -> Void)? = nil,
        action: (() -> Void)? = nil
    ) {
        expire()
        let toast = Toast(text: text, actionLabel: action == nil ? nil : actionLabel)
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
