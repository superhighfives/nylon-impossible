//
//  ToastView.swift
//  Nylon Impossible
//

import SwiftUI

/// The toast pill: inverted colours, the message, and its action in bold.
/// Yellow stays a fill, so the action is set in weight, not colour.
struct ToastView: View {
    let toasts: ToastCenter

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if let toast = toasts.current {
                HStack(spacing: Theme.Space.s1) {
                    Text(toast.text)
                        .lineLimit(1)
                        .padding(.vertical, Theme.Space.s3)
                    if let label = toast.actionLabel {
                        Button(label) { toasts.performAction() }
                            .fontWeight(.bold)
                            .padding(.horizontal, Theme.Space.s3)
                            .frame(minHeight: Theme.Space.rowMinHeight)
                            .contentShape(Rectangle())
                            .buttonStyle(.plain)
                    }
                }
                .textStyle(Theme.Fonts.Role.control)
                .fontWeight(.regular)
                .foregroundStyle(Theme.Colors.canvas)
                .padding(.leading, Theme.Space.s4)
                .padding(.trailing, toast.actionLabel == nil ? Theme.Space.s4 : Theme.Space.s1)
                .background(Theme.Colors.ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
                .id(toast.id)
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 10)))
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(.updatesFrequently)
                .onAppear {
                    AccessibilityNotification.Announcement(toast.text).post()
                }
            }
        }
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.base), value: toasts.current)
    }
}
