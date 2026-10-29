//
//  ContentView+Toolbar.swift
//  Nylon Impossible
//
//  The board's toolbar: New todo (quick add) and New list, in a pill at the
//  right of a row above the columns on iPad, and in the window's toolbar on a
//  Mac. Search joins them with the palette.
//

import SwiftUI

extension ContentView {
    /// Where quick add starts: the selection's column, else Today.
    var quickAddStart: String? {
        if let column = selectionColumn, column != Self.doneColumn { return column }
        return timeList(.today)?.id
    }

    var quickAdd: some View {
        BoardQuickAdd(
            lists: orderedLists,
            startListId: quickAddStart,
            countFor: { counts[$0.lowercased()] ?? 0 },
            onAdd: addQuick
        )
    }

    var newListPopoverBinding: Binding<Bool> {
        Binding(get: { newListAnchor == .toolbar }, set: { if !$0 { newListAnchor = nil } })
    }

    var newListForm: some View {
        NewListForm { name in
            newListAnchor = nil
            commitNewList(name)
        }
    }

    /// Quick add's Return: add to the chosen list and keep the popover open.
    /// Adding somewhere off the board says so, with View.
    func addQuick(_ text: String, to listId: String?, parseDates: Bool) {
        let created = actions.add(draft: text, to: listId, parseDates: parseDates, userId: authService.userId)
        noteAdded(created, to: listId)
        guard !created.isEmpty, let listId,
              !boardColumns.contains(where: { $0.id.lowercased() == listId.lowercased() }) else { return }
        let name = orderedLists.first { $0.id == listId }?.name ?? "List"
        let message = created.count > 1 ? "\(created.count) added to \(name)" : "Added to \(name)"
        actions.toasts.show(message, actionLabel: "View") {
            showsQuickAdd = false
            showColumn(listId)
        }
    }

    #if os(iOS)
    /// The iPad's toolbar row, with a hairline under it.
    var boardToolbar: some View {
        HStack {
            Spacer(minLength: 0)
            HStack(spacing: 2) {
                toolbarButton("New todo", systemImage: Theme.Icon.add) { showsQuickAdd = true }
                    .popover(isPresented: $showsQuickAdd, arrowEdge: .top) { quickAdd }
                toolbarButton("New list", systemImage: Theme.Icon.newList) { newListAnchor = .toolbar }
                    .popover(isPresented: newListPopoverBinding, arrowEdge: .top) { newListForm }
            }
            .padding(3)
            .background(Theme.Colors.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.Colors.hairline, lineWidth: 1))
        }
        .padding(.horizontal, Theme.Space.s4)
        .frame(height: 64)
    }

    private func toolbarButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Theme.Colors.inkMuted)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel(title)
    }
    #endif
}
