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

    @State private var keepWords = false
    @FocusState private var isFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var targetId: String? { chosenListId ?? currentListId }

    private var targetName: String {
        lists.first { $0.id == targetId }?.name ?? "Today"
    }

    private var hasDraft: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The date typed at the end of the first line, unless × kept the words.
    private var typedDue: Date? {
        guard !keepWords, hasDraft else { return nil }
        let firstLine = text.split(whereSeparator: \.isNewline).first.map(String.init) ?? text
        return TodoDateParser.parse(firstLine).dueDay
    }

    private var showsChips: Bool { isFocused || hasDraft }

    var body: some View {
        Group {
            switch style {
            case .floating: floating
            case .inline: inline
            }
        }
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: showsChips)
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: hasDraft)
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: typedDue)
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

                if hasDraft {
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
        return Text("Add to \(targetName)…").foregroundStyle(Theme.Colors.inkSubtle)
    }

    private var chips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                // The typed date leads, so it's never scrolled out of sight
                // behind a long run of lists.
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
        }
        .scrollIndicators(.hidden)
        .padding(.top, Theme.Space.s1)
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
                    .frame(width: 28, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
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
        guard hasDraft else { return }
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
