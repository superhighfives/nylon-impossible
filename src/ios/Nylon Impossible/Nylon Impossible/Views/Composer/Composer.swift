//
//  Composer.swift
//  Nylon Impossible
//
//  The one floating element: a Liquid Glass pill that rides the keyboard.
//  "Add to Today…" targets the list in view. While it's focused a chip row
//  offers the other lists and shows the typed date as "Due Fri ×"; × keeps
//  the words in the title. Return adds and keeps focus for the next one; a
//  pasted list adds a todo per line.
//
//  The share extension uses this same composer, floating at the foot of its
//  sheet: `placeholder` shows a shared link's stand-in title, and
//  `allowsEmptySubmit` lets it be sent as-is.
//
//  On the iPad board the same composer is the quiet "+ Add" row at the top of
//  each column (`style: .inline`): no glass, the chips under the field while
//  it's focused, and Escape hands the keyboard back to the board.
//

import SwiftUI

struct Composer: View {
    enum Style { case floating, inline }

    @Binding var text: String
    /// Every list, in display order, for the target chips.
    let lists: [TodoListModel]
    /// The list in view — the default target.
    let currentListId: String?
    /// A chip the user picked over the default; reset when the page changes.
    @Binding var chosenListId: String?
    /// Raised to focus the field without a tap (the "New Task" quick action).
    @Binding var focusRequested: Bool
    /// Add what's typed to `listId`; `parseDates` is false once × was tapped.
    let onSubmit: (_ listId: String?, _ parseDates: Bool) -> Void
    var style: Style = .floating
    /// Told when the field gains or loses focus, so the board can stand its
    /// single-key shortcuts down while you type.
    var onFocusChange: ((Bool) -> Void)?
    /// Replaces "Add to Today…" — the share sheet shows the title a shared
    /// link will get if nothing is typed.
    var placeholder: String?
    /// Send with nothing typed (the share sheet, where the placeholder is
    /// what's saved). The send button then shows from the start.
    var allowsEmptySubmit = false

    @State private var keepWords = false
    @FocusState private var isFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var targetId: String? { chosenListId ?? currentListId }

    private var targetName: String {
        lists.first { $0.id == targetId }?.name ?? "Today"
    }

    private var hasDraft: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The first date typed among the lines, unless × kept the words. Each
    /// line is parsed when it's added, so a pasted list whose third line ends
    /// "friday" still shows the chip — and × keeps the words on every line.
    private var typedDue: Date? {
        guard !keepWords, hasDraft else { return nil }
        return text.split(whereSeparator: \.isNewline).lazy
            .compactMap { TodoDateParser.parse(String($0)).dueDay }
            .first
    }

    private var showsChips: Bool { isFocused || hasDraft }

    private var canSubmit: Bool { hasDraft || allowsEmptySubmit }

    var body: some View {
        Group {
            switch style {
            case .floating: floating
            case .inline: inline
            }
        }
        // The field grows and the chips push it up: movement, so none of it
        // animates under Reduce Motion.
        .animation(Theme.Motion.moving(Theme.Motion.fast, reduceMotion: reduceMotion), value: showsChips)
        .animation(Theme.Motion.moving(Theme.Motion.fast, reduceMotion: reduceMotion), value: hasDraft)
        .animation(Theme.Motion.moving(Theme.Motion.fast, reduceMotion: reduceMotion), value: typedDue)
        .onChange(of: text) { _, newValue in
            if newValue.isEmpty { keepWords = false }
        }
        .onChange(of: isFocused) { _, focused in onFocusChange?(focused) }
        .onAppear(perform: takeFocusIfRequested)
        .onChange(of: focusRequested) { takeFocusIfRequested() }
    }

    private var field: some View {
        TextField("New todo", text: $text, prompt: prompt, axis: .vertical)
            .textStyle(style == .inline ? Theme.Fonts.Role.bodyWide : Theme.Fonts.Role.body)
            .foregroundStyle(Theme.Colors.ink)
            .lineLimit(1...4)
            .focused($isFocused)
            .submitLabel(.return)
            .onChange(of: text, handleReturn)
            .onKeyPress(.escape) {
                isFocused = false
                return .handled
            }
            .accessibilityLabel("New todo")
    }

    private var floating: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsChips {
                chips
                    .padding(.horizontal, 10)
                    .transition(.opacity)
            }
            HStack(alignment: .bottom, spacing: 0) {
                field
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)

                if canSubmit {
                    Button(action: submit) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Theme.Colors.brandInk)
                            .frame(width: 36, height: 36)
                            .background(Theme.Colors.brand, in: Circle())
                            .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, Theme.Space.s1)
                    .padding(.bottom, Theme.Space.s1)
                    .transition(.opacity.combined(with: .scale(scale: reduceMotion ? 1 : 0.8)))
                    .accessibilityLabel("Add todo")
                }
            }
        }
        .glassEffect(.regular, in: .rect(cornerRadius: Theme.Phone.composerRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Phone.composerRadius, style: .continuous)
                .strokeBorder(Theme.Colors.hairline.opacity(0.6), lineWidth: 0.5)
        )
        .contentShape(RoundedRectangle(cornerRadius: Theme.Phone.composerRadius))
        .onTapGesture { isFocused = true }
        .padding(.horizontal, Theme.Space.s3)
        .padding(.bottom, Theme.Space.s2)
    }

    /// "+ Add": the field's own placeholder is the row, so tapping it (or
    /// pressing n) focuses in place.
    private var inline: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: Theme.Space.s3) {
                Image(systemName: Theme.Icon.add)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(width: Theme.Phone.checkbox)
                    .accessibilityHidden(true)
                field
            }
            .padding(.vertical, Theme.Space.s3)
            .frame(minHeight: Theme.Space.rowMinHeight)
            .contentShape(Rectangle())
            .onTapGesture { isFocused = true }
            if showsChips {
                chips
                    .padding(.bottom, Theme.Space.s1)
                    .transition(.opacity)
            }
        }
    }

    private var prompt: Text {
        if style == .inline, !isFocused {
            return Text("Add").foregroundStyle(Theme.Colors.inkMuted)
        }
        // Muted, not subtle: the placeholder is the composer's only label
        // and sits on glass over whatever scrolls under it, where the
        // subtle grey dropped under 4.5:1.
        if let placeholder {
            return Text(placeholder).foregroundStyle(Theme.Colors.inkMuted)
        }
        return Text("Add to \(targetName)…").foregroundStyle(Theme.Colors.inkMuted)
    }

    /// One scrolling row; at accessibility text sizes they wrap instead, so
    /// no chip is ever cut off at the edge of the field.
    @ViewBuilder
    private var chips: some View {
        if dynamicTypeSize.isAccessibilitySize {
            FlowLayout(spacing: 6, lineSpacing: 0) { chipItems }
                .padding(.top, Theme.Space.s1)
        } else {
            ScrollView(.horizontal) {
                HStack(spacing: 6) { chipItems }
            }
            .scrollIndicators(.hidden)
            .padding(.top, Theme.Space.s1)
        }
    }

    @ViewBuilder
    private var chipItems: some View {
        // The typed date leads, so it's never scrolled out of sight behind a
        // long run of lists.
        if let due = typedDue {
            dueChip(due)
        }
        ForEach(lists) { list in
            ChipButton(text: list.name, isOn: list.id == targetId, strong: true) {
                chosenListId = list.id == currentListId ? nil : list.id
            }
            .accessibilityLabel("Add to \(list.name)")
        }
    }

    private func dueChip(_ due: Date) -> some View {
        HStack(spacing: 6) {
            Image(systemName: Theme.Icon.due)
                .imageScale(.small)
                .accessibilityHidden(true)
            Text(DueLabel.chip(for: due))
            Button {
                keepWords = true
            } label: {
                Image(systemName: Theme.Icon.close)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // A 44pt target that lays out as the old 36 × 32, so the chip
            // keeps its size and the × its place.
            .padding(.vertical, -6)
            .padding(.trailing, -8)
            .accessibilityLabel("Don’t treat as a date")
        }
        .textStyle(Theme.Fonts.Role.chip)
        .foregroundStyle(Theme.Colors.ink)
        .padding(.leading, Theme.Space.s3)
        .frame(minHeight: 32)
        .background(Theme.Colors.fill, in: RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
        .frame(minHeight: Theme.Space.rowMinHeight)
        .transition(.opacity)
    }

    /// A vertical TextField's Return inserts a newline rather than submitting,
    /// so a single typed "\n" at the end is Return. A paste arrives as a larger
    /// change and stays in the field, a todo per line, until it's sent.
    private func handleReturn(_ oldValue: String, _ newValue: String) {
        guard newValue.hasSuffix("\n"), newValue.count == oldValue.count + 1 else { return }
        text = String(newValue.dropLast())
        submit()
    }

    private func submit() {
        guard canSubmit else { return }
        onSubmit(targetId, !keepWords)
        keepWords = false
        // Keep focus for rapid entry.
        isFocused = true
    }

    private func takeFocusIfRequested() {
        guard focusRequested else { return }
        focusRequested = false
        Task { isFocused = true }
    }
}
