//
//  ShareSheetView.swift
//  Nylon Share
//
//  Created by Charlie Gleason on 3/4/26.
//
//  "Add to Nylon" from the share sheet, in the app's composer style: the same
//  pill field and send button, the same list chips (Today by default), and
//  the same "Due Fri ×" chip for a typed date.
//

import SwiftUI

/// A list the share sheet can add to.
struct ShareList: Identifiable, Equatable {
    let id: String
    let name: String
}

struct ShareSheetView: View {
    let content: String
    let isURL: Bool
    let lists: [ShareList]
    let onSave: (_ title: String, _ listId: String?, _ parseDates: Bool) -> Void
    let onCancel: () -> Void

    @State private var taskTitle: String = ""
    @State private var listId: String?
    @State private var keepWords = false
    @FocusState private var isFocused: Bool

    /// The title saved when the field is left empty, shown greyed out inside it.
    /// nil for shared text, which is the todo itself and so starts *in* the
    /// field rather than behind it.
    private let emptyFallback: String?
    /// Whether `emptyFallback` is the "Check {domain}" title we generated —
    /// nothing came from the sharing app, so the server will name this todo
    /// properly once it fetches the link.
    private let fallbackIsGenerated: Bool

    private var willUseGeneratedTitle: Bool {
        fallbackIsGenerated && taskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// What Save writes — the typed title, or the fallback behind it.
    private var savedTitle: String {
        TaskCreationService.shareSheetTitle(typed: taskTitle, fallback: emptyFallback ?? "")
    }

    private var typedDue: Date? {
        guard !keepWords else { return nil }
        return TodoDateParser.parse(taskTitle).dueDay
    }

    init(
        content: String,
        isURL: Bool,
        prefilledTitle: String? = nil,
        lists: [ShareList] = [],
        onSave: @escaping (_ title: String, _ listId: String?, _ parseDates: Bool) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.content = content
        self.isURL = isURL
        self.lists = lists
        self.onSave = onSave
        self.onCancel = onCancel
        // Use the app-provided title (e.g. an article title from Reeder) when
        // there is one; otherwise a placeholder from the URL, which the server
        // replaces with the page's real title on the next sync.
        let trimmed = prefilledTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let supplied = trimmed?.isEmpty == false ? trimmed : nil
        emptyFallback = isURL ? (supplied ?? TaskCreationService.titleFromURL(content)) : nil
        fallbackIsGenerated = isURL && supplied == nil
        _taskTitle = State(initialValue: isURL ? "" : content)
        _listId = State(initialValue: lists.first?.id)
    }

    private var targetName: String {
        lists.first { $0.id == listId }?.name ?? "Today"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button("Cancel", action: onCancel)
                    .textStyle(Theme.Fonts.Role.control)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(minHeight: Theme.Space.rowMinHeight)
                    .buttonStyle(.plain)
                Spacer()
            }
            .padding(.top, Theme.Space.s2)

            Text("Add to Nylon")
                .textStyle(Theme.Fonts.Role.sheetTitle, tracking: Theme.Tracking.sheetTitle)
                .foregroundStyle(Theme.Colors.ink)
                .padding(.top, Theme.Space.s2)
                .padding(.bottom, Theme.Space.s4)
                .accessibilityAddTraits(.isHeader)

            field

            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    if let due = typedDue { dueChip(due) }
                    ForEach(lists) { list in
                        ChipButton(text: list.name, isOn: list.id == listId, strong: true) {
                            listId = list.id
                        }
                        .accessibilityLabel("Add to \(list.name)")
                    }
                }
            }
            .scrollIndicators(.hidden)
            .padding(.top, Theme.Space.s2)

            if willUseGeneratedTitle {
                Text("Leave this empty and Nylon will title the todo from the link once it fetches it.")
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.top, Theme.Space.s3)
            }

            if isURL {
                Hairline().padding(.vertical, Theme.Space.s4)
                SectionLabel(text: "Link")
                Text(content)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .lineLimit(2)
                    .truncationMode(.middle)
                    .padding(.top, Theme.Space.s1)
            }

            Spacer()
        }
        .padding(.horizontal, Theme.Phone.gutter)
        .background(Theme.Colors.canvas.ignoresSafeArea())
        .onAppear { isFocused = true }
        .onChange(of: taskTitle) { _, newValue in
            if newValue.isEmpty { keepWords = false }
        }
    }

    private var field: some View {
        HStack(alignment: .bottom, spacing: 0) {
            TextField(
                "Todo",
                text: $taskTitle,
                prompt: Text(emptyFallback ?? "Add to \(targetName)…").foregroundStyle(Theme.Colors.inkSubtle),
                axis: .vertical
            )
            .textStyle(Theme.Fonts.Role.body)
            .foregroundStyle(Theme.Colors.ink)
            .lineLimit(1...6)
            .focused($isFocused)
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            Button(action: save) {
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
            .disabled(savedTitle.isEmpty)
            .opacity(savedTitle.isEmpty ? 0.4 : 1)
            .accessibilityLabel("Add to \(targetName)")
        }
        .background(Theme.Colors.surface, in: RoundedRectangle(cornerRadius: Theme.Phone.composerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Phone.composerRadius, style: .continuous)
                .strokeBorder(Theme.Colors.hairline, lineWidth: 1)
        )
    }

    private func dueChip(_ due: Date) -> some View {
        HStack(spacing: 6) {
            Image(systemName: Theme.Icon.due).imageScale(.small).accessibilityHidden(true)
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
    }

    private func save() {
        guard !savedTitle.isEmpty else { return }
        onSave(savedTitle, listId, !keepWords)
    }
}

#Preview {
    ShareSheetView(
        content: "https://example.com/article",
        isURL: true,
        lists: [ShareList(id: "t", name: "Today"), ShareList(id: "w", name: "This Week")],
        onSave: { _, _, _ in },
        onCancel: {}
    )
}
