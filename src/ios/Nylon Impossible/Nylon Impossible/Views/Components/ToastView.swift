//
//  ToastView.swift
//  Nylon Impossible
//

import SwiftUI

/// The toast pill: inverted colours, the message, and its action in bold.
/// Yellow stays a fill, so the action is set in weight, not colour.
///
/// VoiceOver hears the toast as an announcement that says how to undo, and
/// can undo without finding the pill: a two-finger double-tap (the Magic
/// Tap) runs the action, from anywhere on the screen. `ToastCenter` keeps
/// the toast up longer while VoiceOver or Switch Control is running.
struct ToastView: View {
    let toasts: ToastCenter

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if let toast = toasts.current {
                // At large text sizes the message wraps and the action drops
                // underneath, rather than either one truncating.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: Theme.Space.s1) { content(toast, stacked: false) }
                    VStack(alignment: .leading, spacing: 0) { content(toast, stacked: true) }
                }
                .textStyle(Theme.Fonts.Role.control)
                .fontWeight(.regular)
                .foregroundStyle(Theme.Colors.canvas)
                .padding(.leading, Theme.Space.s4)
                .padding(.trailing, toast.actionLabel == nil ? Theme.Space.s4 : Theme.Space.s1)
                .background(Theme.Colors.ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
                .padding(.horizontal, Theme.Space.s4)
                .id(toast.id)
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 10)))
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(.updatesFrequently)
                .onAppear {
                    AccessibilityNotification.Announcement(Self.announcement(for: toast)).post()
                }
            }
        }
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.base), value: toasts.current)
    }

    @ViewBuilder
    private func content(_ toast: ToastCenter.Toast, stacked: Bool) -> some View {
        Text(toast.text)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Theme.Space.s3)
            .padding(.bottom, stacked && toast.actionLabel != nil ? 0 : Theme.Space.s3)
        if let label = toast.actionLabel {
            Button(label) { toasts.performAction() }
                .fontWeight(.bold)
                .padding(.leading, stacked ? 0 : Theme.Space.s3)
                .padding(.trailing, Theme.Space.s3)
                .frame(minWidth: Theme.Space.rowMinHeight, minHeight: Theme.Space.rowMinHeight)
                .contentShape(Rectangle())
                .buttonStyle(.plain)
                .accessibilityHint("Or double-tap with two fingers anywhere")
        }
    }

    /// "Done. Undo: double-tap with two fingers." — what VoiceOver says.
    static func announcement(for toast: ToastCenter.Toast) -> String {
        guard let label = toast.actionLabel else { return toast.text }
        return "\(toast.text). \(label): double-tap with two fingers."
    }
}

extension View {
    /// The Magic Tap (VoiceOver's two-finger double-tap) runs the toast's
    /// action — Undo, View — wherever focus is. Attach it at a screen's root.
    func toastMagicTap(_ toasts: ToastCenter) -> some View {
        #if os(iOS)
        accessibilityAction(.magicTap) {
            if toasts.current?.actionLabel != nil { toasts.performAction() }
        }
        #else
        // VoiceOver on the Mac has no Magic Tap; ⌘Z reaches Undo instead
        // (`ToastUndoBridge`).
        self
        #endif
    }
}
