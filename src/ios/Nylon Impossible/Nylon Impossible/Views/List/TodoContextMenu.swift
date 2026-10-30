//
//  TodoContextMenu.swift
//  Nylon Impossible
//
//  A row's long-press (and, on iPad, right-click) menu. The phone lists the
//  moves flat under a "Move to" header (see MoveMenuPlan). The wide
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
        let plan = MoveMenuPlan(others: others, recentIds: actions.recentLists.ids)
        Section("Move to") {
            ForEach(plan.timeLists) { target in
                moveButton(target, label: target.name, systemImage: arrow(to: target))
            }
            ForEach(plan.recent) { target in
                moveButton(target, label: target.name, systemImage: "list.bullet")
            }
            if !plan.more.isEmpty {
                Menu {
                    ForEach(plan.more) { target in
                        moveButton(target, label: target.name, systemImage: "list.bullet")
                    }
                } label: {
                    Label("More", systemImage: "ellipsis")
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
                    moveButton(target, label: target.name, systemImage: arrow(to: target))
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

    private func arrow(to target: TodoListModel) -> String {
        let here = todo.listKey?.lowercased()
        return MoveMenuPlan.arrow(to: target, from: lists.first { $0.id.lowercased() == here })
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

/// What VoiceOver hears for a row and the actions it offers in place of the
/// checkbox and the long-press menu. Kept apart from the view so the words
/// and their order can be tested.
enum TodoRowAccessibility {
    enum Action: Identifiable, Equatable {
        case markDone, markNotDone
        case move(listId: String, name: String)
        case pin, unpin
        case delete

        var id: String {
            switch self {
            case .move(let listId, _): return "move-\(listId)"
            default: return name
            }
        }

        var name: String {
            switch self {
            case .markDone: return "Mark done"
            case .markNotDone: return "Mark not done"
            case .move(_, let name): return "Move to \(name)"
            case .pin: return "Pin to top"
            case .unpin: return "Unpin"
            case .delete: return "Delete"
            }
        }
    }

    /// "Pinned, Due Fri, Not done": the meta line, then the checkbox.
    static func value(parts: [MetaPart], isChecked: Bool) -> String {
        let meta = TodoMeta.accessibilityText(parts)
        let state = isChecked ? "Done" : "Not done"
        return meta.isEmpty ? state : "\(meta), \(state)"
    }

    /// Mark done first (it's the checkbox), then the menu's order: a move
    /// to every other list, Pin, Delete.
    static func actions(for todo: TodoItem, isChecked: Bool, lists: [TodoListModel]) -> [Action] {
        let here = todo.listKey?.lowercased()
        let moves = lists
            .filter { $0.id.lowercased() != here }
            .map { Action.move(listId: $0.id, name: $0.name) }
        return [isChecked ? .markNotDone : .markDone] + moves + [todo.pinned ? .unpin : .pin, .delete]
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
