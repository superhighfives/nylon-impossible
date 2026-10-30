//
//  BoardDoneColumn.swift
//  Nylon Impossible
//
//  Done as the board's fourth column, its resting state: finished todos
//  grouped by day, under a muted title. Rows select like any column's; the
//  check (or X, Return or Space on the selection) puts one back, and Delete
//  removes it. Read from ContentView's todos, not a @Query of its own: on
//  the Mac the board is its own hosting view (see `ContentRoot`).
//

import SwiftUI

struct BoardDoneColumn: View {
    /// Finished top-level todos, newest first.
    let todos: [TodoItem]
    let lists: [TodoListModel]
    let selectedId: UUID?
    let onSelect: (TodoItem) -> Void
    let onRestore: (TodoItem) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.selectsByKeyboard) private var selectsByKeyboard

    private struct DayGroup: Identifiable {
        let id: Date
        let label: String
        let items: [TodoItem]
    }

    /// By day, newest first; `todos` is already in that order.
    private var groups: [DayGroup] {
        let calendar = Calendar.current
        var groups: [DayGroup] = []
        for todo in todos {
            let day = calendar.startOfDay(for: todo.completedAt ?? todo.updatedAt)
            if let last = groups.last, last.id == day {
                groups[groups.count - 1] = DayGroup(id: day, label: last.label, items: last.items + [todo])
            } else {
                groups.append(DayGroup(id: day, label: DayLabel.text(day), items: [todo]))
            }
        }
        return groups
    }

    private func listName(_ todo: TodoItem) -> String {
        lists.first { $0.id.lowercased() == todo.listKey?.lowercased() }?.name ?? "Today"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BoardColumnHeader(title: "Done", subline: "Finished todos, by day", isMuted: true)
            Hairline()
                .padding(.horizontal, Theme.Wide.gutter)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    let groups = groups
                    if groups.isEmpty {
                        EmptyLine(text: "Nothing done yet.")
                    }
                    ForEach(groups) { group in
                        SectionLabel(text: group.label)
                            .padding(.horizontal, Theme.Wide.gutter)
                            .padding(.top, Theme.Space.s3)
                            .padding(.bottom, 6)
                        ForEach(group.items) { todo in
                            row(todo)
                        }
                    }
                }
                .padding(.top, Theme.Space.s2)
                .padding(.bottom, Theme.Space.s16)
            }
            .scrollIndicators(.hidden)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        // The fourth column is always tinted, whatever it shows, so it reads
        // as distinct from the three time columns.
        .background(Theme.Colors.surface)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Done")
    }

    private func row(_ todo: TodoItem) -> some View {
        let selected = selectedId == todo.id
        return HStack(alignment: .top, spacing: Theme.Space.s3) {
            Checkbox(isChecked: true, isMuted: true, label: "Put \(todo.title) back") {
                restore(todo)
            }
            .padding(.leading, -10)
            .padding(.trailing, -6)
            .padding(.vertical, -10)
            Button { onSelect(todo) } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(todo.title)
                        .textStyle(Theme.Fonts.Role.rowTitleWide)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .strikethrough(true, color: Theme.Colors.inkMuted)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                    Text(listName(todo))
                        .textStyle(Theme.Fonts.Role.meta)
                        .foregroundStyle(Theme.Colors.inkMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, Theme.Space.s3)
        .frame(minHeight: Theme.Space.rowMinHeight)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                .fill(Theme.Colors.fill)
                .padding(.horizontal, -10)
                .overlay(alignment: .leading) { RowSelectionBar(isOn: selectsByKeyboard) }
                .opacity(selected ? 1 : 0)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, Theme.Wide.gutter)
        .id(todo.id)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(todo.title)
        .accessibilityValue("Done, from \(listName(todo))")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint("Puts it back in \(listName(todo))")
        .accessibilityAction { restore(todo) }
    }

    private func restore(_ todo: TodoItem) {
        withAnimation(reduceMotion ? nil : Theme.Motion.easeOutStrong(Theme.Motion.base)) {
            onRestore(todo)
        }
    }
}
