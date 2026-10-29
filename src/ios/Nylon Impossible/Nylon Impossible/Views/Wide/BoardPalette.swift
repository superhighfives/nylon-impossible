//
//  BoardPalette.swift
//  Nylon Impossible
//
//  The command palette (⌘K), and the same dialog for Move to (M) and Go to a
//  list (G L): a search field over grouped results. ↑ ↓ choose, Return runs,
//  Esc closes. What's in it comes from `ContentView.paletteGroups`.
//

import SwiftUI

/// What the palette is showing.
enum PaletteMode: Equatable {
    /// Go to, Commands, and Todos once something's typed.
    case all
    /// Your lists only (G L).
    case lists
    /// Move this todo to a list (M).
    case move(UUID)
}

struct PaletteItem: Identifiable {
    let id: String
    let label: String
    /// Muted, after the label: a count, or the list a todo is in.
    var meta: String?
    /// The key that does the same thing: "⇧1", "X".
    var hint: String?
    let run: () -> Void
}

struct PaletteGroup: Identifiable {
    let title: String
    let items: [PaletteItem]
    var id: String { title }
}

struct BoardPalette: View {
    /// Above the field: `Move “Plan Lisbon trip”`, `Go to a list`.
    let title: String?
    let placeholder: String
    let groups: (String) -> [PaletteGroup]
    let onClose: () -> Void

    @State private var query = ""
    @State private var active = 0
    @FocusState private var fieldFocused: Bool

    var body: some View {
        let shown = groups(query).filter { !$0.items.isEmpty }
        let items = shown.flatMap(\.items)
        let at = min(active, max(items.count - 1, 0))
        ZStack(alignment: .top) {
            Color.black.opacity(0.18)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                if let title {
                    Text(title)
                        .textStyle(Theme.Fonts.Role.label)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .lineLimit(1)
                        .padding(.horizontal, 18)
                        .padding(.top, 14)
                }
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .accessibilityHidden(true)
                    TextField(placeholder, text: $query)
                        .textStyle(Theme.Fonts.Role.bodyWide)
                        .textFieldStyle(.plain)
                        .focused($fieldFocused)
                        .submitLabel(.go)
                        .onSubmit { choose(items, at) }
                        .onChange(of: query) { active = 0 }
                        .onKeyPress(.downArrow) {
                            if !items.isEmpty { active = (at + 1) % items.count }
                            return .handled
                        }
                        .onKeyPress(.upArrow) {
                            if !items.isEmpty { active = (at - 1 + items.count) % items.count }
                            return .handled
                        }
                        .onKeyPress(.escape) {
                            onClose()
                            return .handled
                        }
                        .accessibilityLabel(placeholder)
                }
                .padding(.horizontal, 18)
                .frame(minHeight: 48)
                Hairline()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            if items.isEmpty {
                                Text("Nothing matches “\(query.trimmingCharacters(in: .whitespaces))”.")
                                    .textStyle(Theme.Fonts.Role.bodyWide)
                                    .foregroundStyle(Theme.Colors.inkMuted)
                                    .padding(12)
                            }
                            ForEach(shown) { group in
                                SectionLabel(text: group.title)
                                    .padding(.horizontal, 12)
                                    .padding(.top, 8)
                                    .padding(.bottom, 4)
                                ForEach(group.items) { item in
                                    let index = items.firstIndex { $0.id == item.id } ?? 0
                                    row(item, selected: index == at)
                                        .id(item.id)
                                        .onTapGesture { choose(items, index) }
                                        .onHover { if $0 { active = index } }
                                }
                            }
                        }
                        .padding(6)
                    }
                    .frame(maxHeight: 380)
                    .onChange(of: at) { _, index in
                        if items.indices.contains(index) { proxy.scrollTo(items[index].id) }
                    }
                }
                Hairline()
                Text("↑↓ to choose · ↵ to run · esc to close")
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .accessibilityHidden(true)
            }
            .frame(width: 540)
            .background(Theme.Colors.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.Colors.hairline))
            .shadow(color: .black.opacity(0.18), radius: 20, y: 16)
            .padding(.top, 90)
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityLabel(title ?? "Search and commands")
        }
        .onAppear { fieldFocused = true }
    }

    private func row(_ item: PaletteItem, selected: Bool) -> some View {
        HStack(spacing: 12) {
            Text(item.label)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let meta = item.meta {
                Text(meta)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            if let hint = item.hint {
                Text(hint)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .accessibilityHidden(true)
            }
        }
        .textStyle(Theme.Fonts.Role.bodyWide)
        .foregroundStyle(Theme.Colors.ink)
        .padding(.horizontal, 12)
        .frame(minHeight: 40)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Theme.Colors.fill)
                .opacity(selected ? 1 : 0)
        )
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { onClose(); item.run() }
    }

    private func choose(_ items: [PaletteItem], _ index: Int) {
        guard items.indices.contains(index) else { return }
        let item = items[index]
        onClose()
        item.run()
    }
}
