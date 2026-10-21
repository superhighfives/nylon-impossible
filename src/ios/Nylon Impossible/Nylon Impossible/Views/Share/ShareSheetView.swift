//
//  ShareSheetView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//
//  "Add to Nylon" from the share sheet. It is the app's own composer, not a
//  lookalike: the same `Composer` floating at the foot of the sheet with its
//  list chips (Today by default), the "Due Fri ×" chip, and one todo per
//  line. Above it, what was shared — a link shows its domain, which is what
//  the todo is called until Nylon fetches the page.
//
//  Lives with the app's views and is compiled into the share extension, so
//  the DEBUG screenshot route can draw it too.
//

import SwiftUI

struct ShareSheetView: View {
    /// What Add sends: the text as typed, the target list, and whether a
    /// typed date still counts (false once its × was tapped).
    struct Submission: Equatable {
        let text: String
        let listId: String?
        let parseDates: Bool
    }

    /// The shared link, if one was shared.
    let url: String?
    /// Today, This Week, Someday, then your lists — in the app's order.
    let lists: [TodoListModel]
    let onSave: (Submission) -> Void
    let onCancel: () -> Void

    @State private var text: String
    @State private var chosenListId: String?
    @State private var focusRequested = true

    /// What the field shows greyed out for a link: the sharing app's title,
    /// or the domain.
    private let linkPlaceholder: String?
    private let domain: String?
    /// The sharing app supplied a page title.
    private let hasSuppliedTitle: Bool

    init(
        text: String = "",
        url: String? = nil,
        suppliedTitle: String? = nil,
        lists: [TodoListModel] = [],
        onSave: @escaping (Submission) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.url = url
        self.lists = lists
        self.onSave = onSave
        self.onCancel = onCancel
        _text = State(initialValue: text)
        let supplied = suppliedTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        hasSuppliedTitle = supplied?.isEmpty == false
        domain = url.flatMap(ShareCapture.displayDomain(for:))
        linkPlaceholder = url == nil ? nil : (hasSuppliedTitle ? supplied : (domain ?? url))
    }

    private var todayId: String? {
        lists.first { $0.systemKind == .today }?.id
    }

    private var lineCount: Int {
        TodoText.entries(fromDraft: text).count
    }

    var body: some View {
        // Scrolls, so the keyboard and the composer riding it can't push the
        // title off the top of a short sheet or a large text size.
        ScrollView {
            header
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Composer(
                text: $text,
                lists: lists,
                currentListId: todayId,
                chosenListId: $chosenListId,
                focusRequested: $focusRequested,
                onSubmit: submit,
                placeholder: linkPlaceholder,
                allowsEmptySubmit: url != nil
            )
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button("Cancel", action: onCancel)
                    .textStyle(Theme.Fonts.Role.control)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(minHeight: Theme.Space.rowMinHeight)
                    .buttonStyle(.plain)
                Spacer()
            }
            .padding(.top, Theme.Space.s2)

            Text("Add to Nylon")
                .textStyle(Theme.Fonts.Role.sheetTitle, tracking: Theme.Tracking.sheetTitle)
                .foregroundStyle(Theme.Colors.ink)
                .padding(.top, Theme.Space.s1)
                .accessibilityAddTraits(.isHeader)

            Text(subline)
                .textStyle(Theme.Fonts.Role.subline)
                .foregroundStyle(Theme.Colors.inkMuted)
                .padding(.top, Theme.Space.s1)
                .contentTransition(.numericText())
                .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: lineCount)

            if let url {
                Hairline().padding(.top, Theme.Space.s5)
                linkRow(url)
                Hairline()
            }

        }
        .padding(.horizontal, Theme.Phone.gutter)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    /// "1 todo" grows to "3 todos" as lines are typed or pasted, so a
    /// multi-line share says what it's about to do.
    private var subline: String {
        let count = max(lineCount, url == nil ? 0 : 1)
        switch count {
        case 0: return "Type a todo, or a few — one per line."
        case 1: return "1 todo"
        default: return "\(count) todos, one per line"
        }
    }

    /// The link, the way a row's meta line and the detail's link card show
    /// it: the domain, then the address.
    private func linkRow(_ url: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Space.s3) {
            Image(systemName: Theme.Icon.link)
                .imageScale(.small)
                .foregroundStyle(Theme.Colors.inkMuted)
                .frame(width: Theme.Phone.checkbox, height: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(domain ?? url)
                    .textStyle(Theme.Fonts.Role.rowTitle)
                    .foregroundStyle(Theme.Colors.ink)
                    .lineLimit(1)
                Text(url)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if !hasSuppliedTitle {
                    Text("Leave the title empty and it’s named from the page once Nylon fetches it.")
                        .textStyle(Theme.Fonts.Role.meta)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.top, Theme.Space.s1)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, Theme.Space.s3)
        .accessibilityElement(children: .combine)
    }

    private func submit(_ listId: String?, _ parseDates: Bool) {
        onSave(Submission(text: text, listId: listId, parseDates: parseDates))
    }
}

#if DEBUG
#Preview("Link") {
    ShareSheetView(
        url: "https://www.visitlisboa.com/tram-28",
        lists: [
            TodoListModel(id: "t", userId: "u", name: "Today", kind: "system", systemKind: .today),
            TodoListModel(id: "w", userId: "u", name: "This Week", kind: "system", systemKind: .thisWeek)
        ],
        onSave: { _ in },
        onCancel: {}
    )
}
#endif
