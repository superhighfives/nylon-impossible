//
//  ToastView.swift
//  Nylon Impossible
//

import SwiftUI

/// The toast pill, the web's (principle 5): a brand yellow pill with
/// `brandInk` text, and its action (Undo) as an outline button in that ink,
/// the yellow-as-fill with dark ink and lines that Settled "Brand accent"
/// allows. A failure ("Couldn’t …") is a `destructiveSolid` red pill with
/// white ink and the alert icon (Settled "Destructive and overdue red").
///
/// VoiceOver hears the toast as an announcement that says how to undo, and
/// can undo without finding the pill: a two-finger double-tap (the Magic
/// Tap) runs the action, from anywhere on the screen. `ToastCenter` keeps
/// the toast up longer while VoiceOver or Switch Control is running.
///
/// `compact` is the Mac menu bar's: one line in the popover's header, sized
/// for a pointer rather than a 44pt touch, cut off with the whole text in
/// its tooltip (VoiceOver reads it whole anyway).
struct ToastView: View {
    let toasts: ToastCenter
    var compact = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ZStack {
            if let toast = toasts.current, compact {
                compactPill(toast)
            } else if let toast = toasts.current {
                // The action sits beside the message, which wraps if it must.
                // Only at accessibility text sizes does it drop underneath.
                // (A ViewThatFits here could pick the stacked layout for a
                // short "Done · Undo", leaving it two lines tall over the
                // composer.)
                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 0) { content(toast, stacked: true) }
                    } else {
                        HStack(spacing: Theme.Space.s1) { content(toast, stacked: false) }
                    }
                }
                .textStyle(Theme.Fonts.Role.control)
                .fontWeight(.regular)
                .foregroundStyle(Self.ink(toast))
                .padding(.leading, Theme.Space.s4)
                .padding(.trailing, toast.actionLabel == nil ? Theme.Space.s4 : Theme.Space.s1)
                .background(Self.fill(toast), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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

    /// The pill's fill: red for a failure, brand yellow for the rest.
    static func fill(_ toast: ToastCenter.Toast) -> Color {
        toast.isError ? Theme.Colors.destructiveSolid : Theme.Colors.brand
    }

    /// The text, icon and outline on that fill.
    static func ink(_ toast: ToastCenter.Toast) -> Color {
        toast.isError ? Theme.Colors.destructiveSolidInk : Theme.Colors.brandInk
    }

    private func compactPill(_ toast: ToastCenter.Toast) -> some View {
        HStack(spacing: Theme.Space.s2) {
            if toast.isError {
                Image(systemName: Theme.Icon.error)
                    .accessibilityHidden(true)
            }
            Text(toast.text)
                .lineLimit(1)
                .truncationMode(.tail)
            if let label = toast.actionLabel {
                Button { toasts.performAction() } label: {
                    Text(label)
                        .fontWeight(.bold)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, Theme.Space.s2)
                        .overlay(Capsule().strokeBorder(Self.ink(toast), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .textStyle(Theme.Fonts.Role.meta)
        .foregroundStyle(Self.ink(toast))
        .padding(.horizontal, Theme.Space.s2)
        .padding(.vertical, Theme.Space.s1)
        .background(Self.fill(toast), in: Capsule())
        .help(toast.text)
        .id(toast.id)
        .transition(.opacity)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.updatesFrequently)
        .onAppear {
            AccessibilityNotification.Announcement(Self.announcement(for: toast)).post()
        }
    }

    @ViewBuilder
    private func content(_ toast: ToastCenter.Toast, stacked: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s1) {
            if toast.isError {
                Image(systemName: Theme.Icon.error)
                    .accessibilityHidden(true)
            }
            Text(toast.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .layoutPriority(1)
        .padding(.top, Theme.Space.s3)
        .padding(.bottom, stacked && toast.actionLabel != nil ? 0 : Theme.Space.s3)
        if let label = toast.actionLabel {
            Button { toasts.performAction() } label: {
                Text(label)
                    .fontWeight(.bold)
                    .foregroundStyle(Self.ink(toast))
                    // The action never wraps mid-word (on the Mac it split
                    // "Un/do" when the pill was narrow); at accessibility
                    // sizes it drops under the message instead.
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, Theme.ToastAction.paddingX)
                    .frame(minHeight: Theme.ToastAction.height)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.ToastAction.radius, style: .continuous)
                            .strokeBorder(Self.ink(toast), lineWidth: 1)
                    )
                    // The 36pt outline sits in a 44pt target.
                    .frame(minWidth: Theme.Space.rowMinHeight, minHeight: Theme.Space.rowMinHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, stacked ? 0 : Theme.Space.s1)
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
        // (`UndoHistory`).
        self
        #endif
    }
}
