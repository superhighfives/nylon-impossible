//
//  TodoRow.swift
//  Nylon Impossible
//
//  A row carries information, not controls: the checkbox, the title (up to
//  three lines) and one meta line. Everything else — move, pin, delete — is in
//  the long-press menu `ListPage` attaches, and tapping the row opens the
//  detail sheet. There are no swipe actions: a horizontal swipe pages lists.
//
//  On the iPad board the same row takes the wide type scale, tints under the
//  pointer (no controls appear), and draws the keyboard focus ring when it's
//  the selected row.
//

import SwiftUI

struct TodoRow: View {
    let todo: TodoItem
    let subtasks: [TodoItem]
    let actions: TodoActions
    /// The keyboard's current row on the iPad board.
    var isSelected = false
    let onOpen: () -> Void

    @Environment(\.isWideLayout) private var isWide
    @Environment(\.colorScheme) private var colorScheme
    @State private var isHovering = false

    private var gutter: CGFloat { isWide ? Theme.Wide.gutter : Theme.Phone.gutter }

    var body: some View {
        let checked = actions.isChecked(todo)
        let parts = TodoMeta.parts(for: todo, subtasks: subtasks)

        HStack(alignment: .top, spacing: Theme.Space.s3) {
            Checkbox(isChecked: checked, label: checked ? "Mark not done" : "Mark done") {
                actions.toggleDone(todo)
            }
            // The 44pt target overhangs the 24pt box so the box itself lines
            // up with the title's first line and the row's leading gutter.
            .padding(.leading, -10)
            .padding(.trailing, -6)
            .padding(.vertical, -10)

            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: Theme.Space.s1) {
                    Text(todo.title)
                        .textStyle(isWide ? Theme.Fonts.Role.rowTitleWide : Theme.Fonts.Role.rowTitle, tracking: -0.005)
                        .foregroundStyle(checked ? Theme.Colors.inkMuted : Theme.Colors.ink)
                        .strikethrough(checked, color: Theme.Colors.inkMuted)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: checked)
                    if !parts.isEmpty {
                        MetaLine(parts: parts)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // The row tints itself; the pointer shouldn't also morph.
            .hoverEffectDisabled(isWide)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Opens the todo")
        }
        .padding(.vertical, Theme.Space.s3)
        .frame(minHeight: Theme.Space.rowMinHeight)
        .background { highlight }
        .padding(.horizontal, gutter)
        .onHover { isHovering = $0 }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .opacity(actions.fading.contains(todo.id) ? 0 : 1)
        .sensoryFeedback(.impact(weight: .medium), trigger: checked) { _, isChecked in isChecked }
    }

    /// Hover tints; the keyboard's row also gets the ring (ink in light, the
    /// accent in dark, as in the wide prototype).
    private var highlight: some View {
        let shape = RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
        return shape
            .fill(Theme.Colors.fill)
            .overlay {
                shape.strokeBorder(
                    colorScheme == .dark ? Theme.Colors.brand : Theme.Colors.ink,
                    lineWidth: Theme.Wide.focusRing
                )
                .opacity(isSelected ? 1 : 0)
            }
            .opacity(isSelected || isHovering ? 1 : 0)
            .padding(.horizontal, -10)
            .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isHovering)
            .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isSelected)
            .accessibilityHidden(true)
    }
}

/// "Pinned · Fri · ↻ Weekly · 1/4 · ▤ · visitlisboa.com" — only what's set.
struct MetaLine: View {
    let parts: [MetaPart]

    var body: some View {
        FlowLayout(spacing: Theme.Space.s3, lineSpacing: Theme.Space.s1) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                item(part)
            }
        }
        .textStyle(Theme.Fonts.Role.meta)
        .foregroundStyle(Theme.Colors.inkMuted)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TodoMeta.accessibilityText(parts))
    }

    @ViewBuilder
    private func item(_ part: MetaPart) -> some View {
        switch part {
        case .pinned:
            glyphed(Theme.Icon.pin, "Pinned")
        case .due(let text, let overdue):
            Text(text)
                .fontWeight(overdue ? .medium : .regular)
                .foregroundStyle(overdue ? Theme.Colors.overdue : Theme.Colors.inkMuted)
                .monospacedDigit()
        case .repeats(let text):
            glyphed(Theme.Icon.repeat, text)
        case .subtasks(let done, let total):
            glyphed(Theme.Icon.subtasks, "\(done)/\(total)")
                .monospacedDigit()
        case .notes:
            Image(systemName: Theme.Icon.notes)
                .imageScale(.small)
        case .link(let domain):
            glyphed(Theme.Icon.link, domain)
                .lineLimit(1)
        }
    }

    private func glyphed(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: Theme.Space.s1) {
            Image(systemName: symbol).imageScale(.small)
            Text(text)
        }
    }
}
