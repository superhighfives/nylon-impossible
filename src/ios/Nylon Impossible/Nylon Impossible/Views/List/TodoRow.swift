//
//  TodoRow.swift
//  Nylon Impossible
//
//  A row carries information, not controls: the checkbox, the title (up to
//  three lines) and one meta line. Everything else — move, pin, delete — is in
//  the long-press menu `ListPage` attaches, and tapping the row opens the
//  detail sheet. There are no swipe actions: a horizontal swipe pages lists.
//

import SwiftUI

struct TodoRow: View {
    let todo: TodoItem
    let subtasks: [TodoItem]
    let actions: TodoActions
    let onOpen: () -> Void

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
                        .textStyle(Theme.Fonts.Role.rowTitle, tracking: -0.005)
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
            .accessibilityElement(children: .combine)
            .accessibilityHint("Opens the todo")
        }
        .padding(.horizontal, Theme.Phone.gutter)
        .padding(.vertical, Theme.Space.s3)
        .frame(minHeight: Theme.Space.rowMinHeight)
        .opacity(actions.fading.contains(todo.id) ? 0 : 1)
        .sensoryFeedback(.impact(weight: .medium), trigger: checked) { _, isChecked in isChecked }
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
