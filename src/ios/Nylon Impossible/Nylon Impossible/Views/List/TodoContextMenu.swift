//
//  TodoContextMenu.swift
//  Nylon Impossible
//
//  A row's long-press (and, on iPad, right-click) menu. The phone lists each
//  move flat — "Move to This Week" — as the spec's touch menu does. The wide
//  layout groups them the pointer way: Move to…, Due…, Pin, Delete. Delete
//  never confirms; it toasts with Undo.
//

import SwiftUI

struct TodoContextMenu: View {
    enum Style { case phone, wide }

    let todo: TodoItem
    /// Every list in display order.
    let lists: [TodoListModel]
    let actions: TodoActions
    var style: Style = .phone

    private var others: [TodoListModel] {
        let here = todo.listKey?.lowercased()
        return lists.filter { $0.id.lowercased() != here }
    }

    var body: some View {
        switch style {
        case .phone: phone
        case .wide: wide
        }
    }

    @ViewBuilder
    private var phone: some View {
        let timeLists = others.filter(\.isSystem)
        let collections = others.filter { !$0.isSystem }
        Section {
            ForEach(timeLists) { target in
                moveButton(target, label: "Move to \(target.name)", systemImage: "arrow.right")
            }
        }
        if !collections.isEmpty {
            Section {
                ForEach(collections) { target in
                    moveButton(target, label: "Move to \(target.name)", systemImage: "list.bullet")
                }
            }
        }
        Section {
            pinButton
            deleteButton
        }
    }

    @ViewBuilder
    private var wide: some View {
        Menu {
            let timeLists = others.filter(\.isSystem)
            let collections = others.filter { !$0.isSystem }
            Section {
                ForEach(timeLists) { target in
                    moveButton(target, label: target.name, systemImage: "arrow.right")
                }
            }
            if !collections.isEmpty {
                Section {
                    ForEach(collections) { target in
                        moveButton(target, label: target.name, systemImage: "list.bullet")
                    }
                }
            }
        } label: {
            Label("Move to…", systemImage: "arrow.right")
        }
        Menu {
            DueMenuItems(hasDue: todo.dueDate != nil) { actions.setDue(todo, $0) }
        } label: {
            Label("Due…", systemImage: Theme.Icon.due)
        }
        Section {
            pinButton
            deleteButton
        }
    }

    private func moveButton(_ target: TodoListModel, label: String, systemImage: String) -> some View {
        Button {
            actions.move(todo, toList: target.id)
        } label: {
            Label(label, systemImage: systemImage)
        }
    }

    private var pinButton: some View {
        Button {
            actions.togglePin(todo)
        } label: {
            Label(todo.pinned ? "Unpin" : "Pin to top", systemImage: todo.pinned ? "pin.slash" : "pin")
        }
    }

    private var deleteButton: some View {
        Button(role: .destructive) {
            actions.delete(todo)
        } label: {
            Label("Delete", systemImage: Theme.Icon.delete)
        }
    }
}

/// The quick due days, shared by the context menu and the detail's Due chip.
struct DueMenuItems: View {
    let hasDue: Bool
    let set: (Date?) -> Void

    var body: some View {
        Button("Today") { set(DueLabel.inDays(0)) }
        Button("Tomorrow") { set(DueLabel.inDays(1)) }
        Button("Friday") { set(DueLabel.upcoming(weekday: 6)) }
        Button("Next week") { set(DueLabel.upcoming(weekday: 2)) }
        if hasDue {
            Divider()
            Button("No date", role: .destructive) { set(nil) }
        }
    }
}
