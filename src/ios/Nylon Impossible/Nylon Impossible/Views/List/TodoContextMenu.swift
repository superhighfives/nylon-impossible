//
//  TodoContextMenu.swift
//  Nylon Impossible
//
//  A row's long-press menu: the moves flat under a "Move to" header (see
//  MoveMenuPlan), then Pin and Delete, in TodoMenuItem's order. Delete never
//  confirms; it toasts with Undo.
//

import SwiftUI

struct TodoContextMenu: View {
    let todo: TodoItem
    /// Every list in display order.
    let lists: [TodoListModel]
    let actions: TodoActions

    private var others: [TodoListModel] {
        let here = todo.listKey?.lowercased()
        return lists.filter { $0.id.lowercased() != here }
    }

    var body: some View {
        ForEach(TodoMenuItem.items(pinned: todo.pinned), id: \.self) { item in
            switch item {
            case .moveTo: moveSection
            case .pin, .unpin: pinButton
            case .delete: deleteButton
            }
        }
    }

    private var moveSection: some View {
        let plan = MoveMenuPlan(others: others, recentIds: actions.recentLists.ids)
        return Section(TodoMenuItem.moveTo.title) {
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
            let item: TodoMenuItem = todo.pinned ? .unpin : .pin
            Label(item.title, systemImage: todo.pinned ? "pin.slash" : "pin")
        }
    }

    private var deleteButton: some View {
        Button(role: .destructive) {
            actions.delete(todo)
        } label: {
            Label(TodoMenuItem.delete.title, systemImage: Theme.Icon.delete)
        }
    }
}

/// The long-press menu's items, in the canonical todo menu's order
/// (PRINCIPLES.md, "Todo menu"). The phone shows Move to, Pin and Delete; it
/// leaves Mark done to the checkbox, Open link to the row and Due to the
/// detail. A layout may leave items out, but never reorders or renames them.
enum TodoMenuItem: Hashable {
    case moveTo
    case pin, unpin
    case delete

    static func items(pinned: Bool) -> [TodoMenuItem] {
        [.moveTo, pinned ? .unpin : .pin, .delete]
    }

    var title: String {
        switch self {
        case .moveTo: return "Move to"
        case .pin: return "Pin to top"
        case .unpin: return "Unpin"
        case .delete: return "Delete"
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

    /// Mark done first (it's the checkbox), then the menu's order
    /// (TodoMenuItem): a move to every other list, Pin, Delete.
    static func actions(for todo: TodoItem, isChecked: Bool, lists: [TodoListModel]) -> [Action] {
        let here = todo.listKey?.lowercased()
        let menu: [Action] = TodoMenuItem.items(pinned: todo.pinned).flatMap { item -> [Action] in
            switch item {
            case .moveTo:
                return lists
                    .filter { $0.id.lowercased() != here }
                    .map { Action.move(listId: $0.id, name: $0.name) }
            case .pin: return [.pin]
            case .unpin: return [.unpin]
            case .delete: return [.delete]
            }
        }
        return [isChecked ? .markNotDone : .markDone] + menu
    }
}

/// The detail's Due choices, in the order every Due list uses (the web's
/// too): Today, Tomorrow, Friday, Next week, Pick a date…, then No date only
/// when there's a date to clear. Kept apart from the view so it can be tested.
enum DueMenuChoice: Hashable {
    case today, tomorrow, friday, nextWeek
    case pickDate
    case noDate

    static func choices(hasDue: Bool) -> [DueMenuChoice] {
        [.today, .tomorrow, .friday, .nextWeek, .pickDate] + (hasDue ? [.noDate] : [])
    }

    var title: String {
        switch self {
        case .today: return "Today"
        case .tomorrow: return "Tomorrow"
        case .friday: return "Friday"
        case .nextWeek: return "Next week"
        case .pickDate: return "Pick a date…"
        case .noDate: return "No date"
        }
    }

    /// The due day a quick choice sets; nil for Pick a date… and No date.
    func day(now: Date = Date(), calendar: Calendar = .current) -> Date? {
        switch self {
        case .today: return DueLabel.inDays(0, now: now, calendar: calendar)
        case .tomorrow: return DueLabel.inDays(1, now: now, calendar: calendar)
        case .friday: return DueLabel.upcoming(weekday: 6, now: now, calendar: calendar)
        case .nextWeek: return DueLabel.upcoming(weekday: 2, now: now, calendar: calendar)
        case .pickDate, .noDate: return nil
        }
    }
}

/// The detail's Due menu, from DueMenuChoice.
struct DueMenuItems: View {
    let hasDue: Bool
    let showsDatePicker: Bool
    let set: (Date?) -> Void
    let pickDate: () -> Void

    var body: some View {
        ForEach(DueMenuChoice.choices(hasDue: hasDue), id: \.self) { choice in
            switch choice {
            case .pickDate:
                Button(action: pickDate) {
                    Label(showsDatePicker ? "Hide calendar" : choice.title, systemImage: Theme.Icon.due)
                }
            case .noDate:
                Divider()
                Button(choice.title, role: .destructive) { set(nil) }
            default:
                Button(choice.title) { set(choice.day()) }
            }
        }
    }
}
