//
//  BoardQuickAdd.swift
//  Nylon Impossible
//
//  Quick add (New todo), in a popover under the toolbar: the target list's
//  name and count, the composer with a chip per list and a due chip for
//  typed dates. It starts on the selection's column, else Today. Return adds
//  and keeps it open; Esc or a click outside closes it.
//

import SwiftUI

struct BoardQuickAdd: View {
    let lists: [TodoListModel]
    /// The selection's column, else Today.
    let startListId: String?
    let countFor: (String) -> Int
    /// Add what's typed to a list; `parseDates` is false once × was tapped.
    let onAdd: (_ text: String, _ listId: String?, _ parseDates: Bool) -> Void

    @State private var text = ""
    @State private var chosenListId: String?
    @State private var focusRequested = true

    private var target: TodoListModel? {
        let id = chosenListId ?? startListId
        return lists.first { $0.id == id } ?? lists.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(target?.name ?? "Today")
                    .textStyle(Theme.Fonts.Wide.title, tracking: Theme.Tracking.masthead)
                    .foregroundStyle(Theme.Colors.ink)
                    .lineLimit(1)
                Text("\(target.map { countFor($0.id) } ?? 0)")
                    .textStyle(Theme.Fonts.Role.bodyWide)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .monospacedDigit()
            }
            .accessibilityElement(children: .combine)
            Composer(
                text: $text,
                lists: lists,
                currentListId: startListId,
                chosenListId: $chosenListId,
                focusRequested: $focusRequested,
                onSubmit: { listId, parseDates in
                    let typed = text
                    text = ""
                    onAdd(typed, listId, parseDates)
                },
                style: .inline
            )
            Hairline()
                .padding(.top, Theme.Space.s3)
            Text("Return adds and keeps this open · Esc closes")
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .padding(.top, Theme.Space.s3)
        }
        .padding(20)
        .frame(width: 400)
        .background(Theme.Colors.surface)
        .environment(\.isWideLayout, true)
        .presentationCompactAdaptation(.popover)
    }
}
