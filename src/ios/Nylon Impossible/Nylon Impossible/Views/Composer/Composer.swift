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

import SwiftUI

struct Composer: View {
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
        VStack(alignment: .leading, spacing: 0) {
            if showsChips {
                chips
                    .transition(.opacity)
            }
            HStack(alignment: .bottom, spacing: 0) {
                TextField("New todo", text: $text, prompt: prompt, axis: .vertical)
                    .textStyle(Theme.Fonts.Role.body)
                    .foregroundStyle(Theme.Colors.ink)
                    .lineLimit(1...4)
                    .focused($isFocused)
                    .submitLabel(.return)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .onChange(of: text, handleReturn)
                    .accessibilityLabel("New todo")

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
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: showsChips)
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: hasDraft)
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: typedDue)
        .onChange(of: text) { _, newValue in
            if newValue.isEmpty { keepWords = false }
        }
        .onAppear(perform: takeFocusIfRequested)
        .onChange(of: focusRequested) { takeFocusIfRequested() }
    }

    private var prompt: Text {
        Text("Add to \(targetName)…").foregroundStyle(Theme.Colors.inkSubtle)
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
            .padding(.horizontal, 10)
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
