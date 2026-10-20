//
//  ListsIndexPage.swift
//  Nylon Impossible
//
//  The fourth page: your collections with their counts, and a "New list"
//  field at the end. Tapping one pushes it; long-press and drag reorders.
//

import SwiftUI

struct ListsIndexPage: View {
    let collections: [TodoListModel]
    let counts: [String: Int]
    let onOpen: (TodoListModel) -> Void
    /// Create a list; returns false when the server said no.
    let onCreate: (String) async -> Bool
    let onReorder: (IndexSet, Int) -> Void

    @State private var newName = ""
    @State private var isCreating = false
    @FocusState private var isNaming: Bool

    var body: some View {
        List {
            Masthead(title: "Lists", subline: MastheadCopy.lists(count: collections.count))
                .plainListRow()
                .moveDisabled(true)

            ForEach(collections) { list in
                Button {
                    onOpen(list)
                } label: {
                    VStack(spacing: 0) {
                        HStack(spacing: Theme.Space.s3) {
                            Text(list.name)
                                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                                .foregroundStyle(Theme.Colors.ink)
                                .lineLimit(2)
                            Spacer(minLength: Theme.Space.s2)
                            Text("\(counts[list.id.lowercased()] ?? 0)")
                                .textStyle(Theme.Fonts.Role.control)
                                .fontWeight(.regular)
                                .monospacedDigit()
                                .foregroundStyle(Theme.Colors.inkMuted)
                            Chevron()
                        }
                        .padding(.vertical, Theme.Space.s4)
                        Hairline()
                    }
                    .padding(.horizontal, Theme.Phone.gutter)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .plainListRow()
                .accessibilityLabel("\(list.name), \(counts[list.id.lowercased()] ?? 0) todos")
            }
            .onMove(perform: onReorder)

            newListField
                .plainListRow()
                .moveDisabled(true)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .environment(\.defaultMinListRowHeight, 0)
        .contentMargins(.top, Theme.Space.s2, for: .scrollContent)
    }

    private var newListField: some View {
        HStack(spacing: Theme.Space.s3) {
            Image(systemName: isCreating ? "hourglass" : Theme.Icon.add)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Theme.Colors.inkMuted)
                .accessibilityHidden(true)
            TextField("New list", text: $newName)
                .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                .foregroundStyle(Theme.Colors.ink)
                .focused($isNaming)
                .submitLabel(.done)
                .disabled(isCreating)
                .onSubmit(create)
                .accessibilityLabel("New list name")
        }
        .padding(.horizontal, Theme.Phone.gutter)
        .padding(.vertical, Theme.Space.s4)
        .contentShape(Rectangle())
        .onTapGesture { isNaming = true }
    }

    private func create() {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !isCreating else { return }
        isCreating = true
        Task {
            if await onCreate(name) { newName = "" }
            isCreating = false
        }
    }
}

extension View {
    /// A List row with no insets, separator or background of its own.
    func plainListRow() -> some View {
        listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}
