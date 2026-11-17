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
//  pointer (no controls appear), and fills when it's the selected row, with
//  a bar beside it while moving with the keyboard.
//

import SwiftUI

struct TodoRow: View {
    let todo: TodoItem
    let subtasks: [TodoItem]
    let actions: TodoActions
    /// The board's selection (iPad and Mac).
    var isSelected = false
    /// Every list in display order, for VoiceOver's Move actions.
    var lists: [TodoListModel] = []
    /// The board: a click on an unselected row selects it; a click on the
    /// selection (so a double click too) opens it. Nil on the phone, where a
    /// tap opens.
    var onSelect: (() -> Void)?
    let onOpen: () -> Void
    /// The Mac popover: a field in the title's place while it's edited.
    var titleField: AnyView?

    @Environment(\.isWideLayout) private var isWide
    @Environment(\.selectsByKeyboard) private var selectsByKeyboard
    @State private var isHovering = false

    private var gutter: CGFloat { isWide ? Theme.Wide.gutter : Theme.Phone.gutter }

    var body: some View {
        // A sync can delete this todo a beat before the list drops it.
        if !todo.isGone {
            row
        }
    }

    @ViewBuilder private var row: some View {
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

            if let titleField {
                titleField
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                titleButton(checked: checked, parts: parts)
            }
        }
        .padding(.vertical, Theme.Space.s3)
        .frame(minHeight: Theme.Space.rowMinHeight)
        .background { highlight }
        .padding(.horizontal, gutter)
        .onHover { isHovering = $0 }
        // VoiceOver hears one element per row — "title, meta, done or not"
        // — that opens on double-tap, with the checkbox and the long-press
        // menu as its actions (swipe up or down): Mark done, each Move,
        // Pin, Delete. A title being edited keeps its field.
        .accessibilityElement(children: titleField == nil ? .ignore : .contain)
        .accessibilityLabel(todo.title)
        .accessibilityValue(TodoRowAccessibility.value(parts: parts, isChecked: checked))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint("Opens the todo")
        .accessibilityAction(.default, onOpen)
        .accessibilityActions {
            ForEach(TodoRowAccessibility.actions(for: todo, isChecked: checked, lists: lists)) { action in
                Button(action.name) { perform(action) }
            }
        }
        .opacity(actions.fading.contains(todo.id) ? 0 : 1)
        .sensoryFeedback(.impact(weight: .medium), trigger: checked) { _, isChecked in isChecked }
    }

    private func titleButton(checked: Bool, parts: [MetaPart]) -> some View {
        Button(action: tap) {
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
        .pointerHoverEffectDisabled(isWide)
    }

    private func tap() {
        if let onSelect, !isSelected {
            onSelect()
        } else {
            onOpen()
        }
    }

    private func perform(_ action: TodoRowAccessibility.Action) {
        switch action {
        case .markDone, .markNotDone: actions.toggleDone(todo)
        case .move(let listId, _): actions.move(todo, toList: listId)
        case .pin, .unpin: actions.togglePin(todo)
        case .delete: actions.delete(todo)
        }
    }

    /// The board's selection, and the row's only focus indicator: the soft
    /// fill, plus a bar beside it while moving with the keyboard, as on wide
    /// web. Hover tints lightly.
    private var highlight: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
            .fill(Theme.Colors.fill)
            .opacity(isSelected ? 1 : (isHovering ? 0.6 : 0))
            .padding(.horizontal, -10)
            .overlay(alignment: .leading) {
                RowSelectionBar(isOn: isSelected && isWide && selectsByKeyboard)
            }
            .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isHovering)
            .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isSelected)
            .accessibilityHidden(true)
    }
}

/// Beside the board's selected row while moving with the keyboard: the
/// sidebar's bar (3pt, inset 6pt top and bottom), drawn 7pt clear of the
/// row's fill so nothing shifts. Overlaid at the row's content edge, which
/// is 10pt inside the fill. Muted ink is 5:1 or more against canvas,
/// surface and fill.
struct RowSelectionBar: View {
    let isOn: Bool

    var body: some View {
        Capsule()
            .fill(Theme.Colors.inkMuted)
            .frame(width: 3)
            .padding(.vertical, 6)
            .offset(x: -20)
            .opacity(isOn ? 1 : 0)
            .accessibilityHidden(true)
    }
}

/// "Pinned · Fri · ↻ Weekly · 1/4 · ▤ · visitlisboa.com" — only what's set.
/// Pinned, repeat and the due day sit on chips (`MetaPart.chip`): due today
/// on the brand fill, the only yellow on a row, and the rest on `fill`.
/// Overdue stays red text, and subtasks, notes and links stay plain.
struct MetaLine: View {
    let parts: [MetaPart]

    /// The chip's 20pt height, grown with Dynamic Type alongside its text.
    @ScaledMetric(relativeTo: .caption) private var chipHeight = Theme.Chip.height

    var body: some View {
        FlowLayout(spacing: Theme.Space.s3, lineSpacing: Theme.Space.s1) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                if let style = part.chip {
                    chip(style) { item(part) }
                } else {
                    item(part)
                }
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
        case .due(let text, let overdue, _):
            if overdue {
                Text(text)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.Colors.overdue)
                    .monospacedDigit()
            } else {
                // On its chip, which sets the ink.
                Text(text)
                    .monospacedDigit()
            }
        case .repeats(let text):
            glyphed(Theme.Icon.repeat, text)
        case .subtasks(let done, let total):
            glyphed(Theme.Icon.subtasks, "\(done)/\(total)")
                .monospacedDigit()
        case .notes(let words):
            glyphed(Theme.Icon.notes, NoteLength.label(words))
                .monospacedDigit()
        case .link(let domain, let more):
            glyphed(Theme.Icon.link, more > 0 ? "\(domain) +\(more)" : domain)
                .lineLimit(1)
        }
    }

    /// A chip: 12pt semibold on `brand` with `brandInk`, or on `fill` with
    /// `ink`, 20pt high with the chip radius.
    private func chip(_ style: MetaChip, @ViewBuilder _ content: () -> some View) -> some View {
        content()
            .textStyle(Theme.Fonts.Role.metaChip)
            .foregroundStyle(style == .brand ? Theme.Colors.brandInk : Theme.Colors.ink)
            .padding(.horizontal, Theme.Chip.paddingX)
            .frame(minHeight: chipHeight)
            .background(
                style == .brand ? Theme.Colors.brand : Theme.Colors.fill,
                in: RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
            )
    }

    private func glyphed(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: Theme.Space.s1) {
            Image(systemName: symbol).imageScale(.small)
            Text(text)
        }
    }
}
