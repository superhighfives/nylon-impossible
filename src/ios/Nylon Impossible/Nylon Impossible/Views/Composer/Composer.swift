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
//  In the Mac's menu bar popover the same composer is a quiet "+ Add" row
//  (`style: .inline`): no glass, and, for now, no chips at all
//  (`offersChips: false`), so what's typed goes to Today as typed.
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
    /// Raised to focus the field without a tap (the "New todo" quick action).
    @Binding var focusRequested: Bool
    /// Add what's typed to `listId`; `parseDates` is false once × was tapped.
    let onSubmit: (_ listId: String?, _ parseDates: Bool) -> Void
    var style: Style = .floating
    /// Told when the field gains or loses focus.
    var onFocusChange: ((Bool) -> Void)?
    /// Replaces "Add to Today…" — the share sheet shows the title a shared
    /// link will get if nothing is typed.
    var placeholder: String?
    /// Send with nothing typed (the share sheet, where the placeholder is
    /// what's saved). The send button then shows from the start.
    var allowsEmptySubmit = false
    /// Esc, after the field lets go: quick add closes its popover with it.
    var onEscape: (() -> Void)?
    /// The Mac menu bar's popover: the chips show once you type (not on
    /// focus), ⇥ and ⇧⇥ step through them, and ↓ leaves the field for the
    /// list below (`onDown`).
    var menuBarKeys = false
    var onDown: (() -> Void)?
    /// False in the Mac's menu bar, for now: no list chips and no "Due Fri ×",
    /// ⇥ picks nothing, and Return sends the text without parsing a date.
    var offersChips = true

    @State private var keepWords = false
    @State private var wasFocused = false
    @State private var refocusAfterResize = false
    @FocusState private var isFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var targetId: String? { chosenListId ?? currentListId }

    /// "Add to today…", "Add to Groceries…": the target inside a sentence.
    private var targetName: String {
        lists.first { $0.id == targetId }?.nameInSentence ?? SystemListKind.today.nameInSentence
    }

    private var hasDraft: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The first date typed among the lines, unless × kept the words. Each
    /// line is parsed when it's added, so a pasted list whose third line ends
    /// "friday" still shows the chip — and × keeps the words on every line.
    private var typedDue: Date? {
        guard offersChips, !keepWords, hasDraft else { return nil }
        return text.split(whereSeparator: \.isNewline).lazy
            .compactMap { TodoDateParser.parse(String($0)).dueDay }
            .first
    }

    private var showsChips: Bool {
        Self.showsChips(offersChips: offersChips, menuBarKeys: menuBarKeys, isFocused: isFocused, hasDraft: hasDraft)
    }

    /// Whether the chip row is under the field.
    static func showsChips(offersChips: Bool, menuBarKeys: Bool, isFocused: Bool, hasDraft: Bool) -> Bool {
        guard offersChips else { return false }
        return menuBarKeys ? hasDraft : (isFocused || hasDraft)
    }

    /// The grabber only shows while the keyboard is up, and not in the share
    /// sheet, which has no keyboard to hand back.
    private var showsHandle: Bool { isFocused && placeholder == nil }

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
        .animation(Theme.Motion.moving(Theme.Motion.fast, reduceMotion: reduceMotion), value: showsHandle)
        .animation(Theme.Motion.moving(Theme.Motion.fast, reduceMotion: reduceMotion), value: typedDue)
        .onChange(of: text) { _, newValue in
            if newValue.isEmpty { keepWords = false }
        }
        .onChange(of: isFocused) { _, focused in
            // The field is rebuilt when the text size changes (see `field`),
            // and the old one lets go of focus: hand it to the new one.
            if !focused, refocusAfterResize {
                refocusAfterResize = false
                isFocused = true
                return
            }
            wasFocused = focused
            onFocusChange?(focused)
        }
        // `isFocused` has already dropped by now; `wasFocused` hasn't. If the
        // rebuild kept the focus after all, don't arm: nothing would clear
        // the flag, and it would undo the next real blur.
        .onChange(of: dynamicTypeSize) {
            refocusAfterResize = wasFocused && !isFocused
        }
        .onAppear(perform: takeFocusIfRequested)
        .onChange(of: focusRequested) { takeFocusIfRequested() }
    }

    private var field: some View {
        TextField("New todo", text: $text, prompt: prompt, axis: .vertical)
            // No bezel on the Mac either: the row and the pill are the field.
            .textFieldStyle(.plain)
            .textStyle(style == .inline ? Theme.Fonts.Role.bodyWide : Theme.Fonts.Role.body)
            .foregroundStyle(Theme.Colors.ink)
            .lineLimit(1...4)
            // A vertical field keeps the height it grew to when the text
            // size goes up and back down, which pushed the rows under it
            // 33pt down. A fresh field per size measures afresh; the
            // draft is in `text`, and `body` gives the new field the focus.
            .id(dynamicTypeSize)
            .focused($isFocused)
            .submitLabel(.return)
            .onChange(of: text, handleReturn)
            #if os(macOS)
            // On the Mac a vertical field's Return fires onSubmit instead of
            // inserting a newline, so handleReturn never sees it. iOS keeps
            // only handleReturn, so a hardware-keyboard Return can't submit
            // twice.
            .onSubmit(submit)
            #endif
            .onKeyPress(.escape) {
                isFocused = false
                onEscape?()
                return .handled
            }
            .onKeyPress(keys: [.tab], phases: .down) { press in
                guard menuBarKeys, offersChips, hasDraft, !lists.isEmpty else { return .ignored }
                let at = lists.firstIndex { $0.id == targetId } ?? 0
                let step = press.modifiers.contains(.shift) ? -1 : 1
                let next = lists[(at + step + lists.count) % lists.count]
                chosenListId = next.id == currentListId ? nil : next.id
                return .handled
            }
            .onKeyPress(.downArrow) {
                guard let onDown, !text.contains("\n") else { return .ignored }
                onDown()
                return .handled
            }
            .accessibilityLabel("New todo")
    }

    /// A grabber that hands the keyboard back: drag it down or tap it. The
    /// list's interactive dismiss needs something to drag, and a short list
    /// has none.
    private var handle: some View {
        Capsule()
            .fill(Theme.Colors.inkMuted.opacity(0.5))
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity, minHeight: 24)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 6)
                    .onEnded { drag in
                        if drag.translation.height > 12 { isFocused = false }
                    }
            )
            .onTapGesture { isFocused = false }
            .accessibilityElement()
            .accessibilityLabel("Hide keyboard")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { isFocused = false }
    }

    private var floating: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsHandle {
                handle
                    .transition(.opacity)
            }
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
        .nylonGlass(cornerRadius: Theme.Phone.composerRadius)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Phone.composerRadius, style: .continuous)
                .strokeBorder(Theme.Colors.hairline.opacity(0.6), lineWidth: 0.5)
        )
        .contentShape(RoundedRectangle(cornerRadius: Theme.Phone.composerRadius))
        .onTapGesture { isFocused = true }
        .padding(.horizontal, Theme.Space.s3)
        .padding(.bottom, Theme.Space.s2)
    }

    /// "+ Add": the field's own placeholder is the row, so tapping it
    /// focuses in place.
    private var inline: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: Theme.Space.s3) {
                // A button, not a hidden glyph: the audit flags drawn content
                // no element covers, and Voice Control can't reach it. It
                // does what tapping the row does.
                Button { isFocused = true } label: {
                    Image(systemName: Theme.Icon.add)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .frame(width: Theme.Phone.checkbox)
                }
                .buttonStyle(.plain)
                // Not "New todo", the field's own label: two elements with
                // one label leave the audit unable to name either.
                .accessibilityLabel("Add")
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
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    HStack(spacing: 6) { chipItems }
                }
                .scrollIndicators(.hidden)
                // The selected list can sit past the edge; bring it into view
                // when the row appears and when the target changes.
                .onAppear { scrollToTarget(proxy) }
                .onChange(of: targetId) { scrollToTarget(proxy) }
            }
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
            .accessibilityLabel("Add to \(list.nameInSentence)")
            .id(list.id)
        }
    }

    private func scrollToTarget(_ proxy: ScrollViewProxy) {
        guard let targetId else { return }
        withAnimation(Theme.Motion.moving(Theme.Motion.fast, reduceMotion: reduceMotion)) {
            proxy.scrollTo(targetId, anchor: .center)
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
        onSubmit(targetId, offersChips && !keepWords)
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
