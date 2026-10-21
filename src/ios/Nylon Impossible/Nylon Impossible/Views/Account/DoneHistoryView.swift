//
//  DoneHistoryView.swift
//  Nylon Impossible
//
//  Done todos, by day. Done means gone from the lists, but not lost: tapping
//  a check puts the todo back in the list it came from.
//

import SwiftData
import SwiftUI

struct DoneHistoryView: View {
    let actions: TodoActions
    let lists: [TodoListModel]

    @Query private var todos: [TodoItem]

    /// How far back the history reaches.
    private static let window = 60

    private struct DayGroup: Identifiable {
        let id: Date
        let label: String
        let items: [TodoItem]
    }

    private var groups: [DayGroup] {
        let calendar = Calendar.current
        let cutoff = calendar.date(byAdding: .day, value: -Self.window, to: Date()) ?? .distantPast
        let done = todos
            .filter { $0.parentId == nil && $0.isCompleted && !$0.isSoftDeleted }
            .map { (todo: $0, at: $0.completedAt ?? $0.updatedAt) }
            .filter { $0.at >= cutoff }
            .sorted { Self.isOrderedBefore($0, $1) }
        let byDay = Dictionary(grouping: done) { calendar.startOfDay(for: $0.at) }
        return byDay.keys.sorted(by: >).map { day in
            DayGroup(id: day, label: DayLabel.text(day), items: byDay[day]?.map(\.todo) ?? [])
        }
    }

    /// Newest first. Todos finished at the same moment (a sync, a batch)
    /// fall back to title, then id, so the order is the same on every run.
    static func isOrderedBefore(_ a: (todo: TodoItem, at: Date), _ b: (todo: TodoItem, at: Date)) -> Bool {
        if a.at != b.at { return a.at > b.at }
        let byTitle = a.todo.title.localizedStandardCompare(b.todo.title)
        if byTitle != .orderedSame { return byTitle == .orderedAscending }
        return a.todo.id.uuidString < b.todo.id.uuidString
    }

    private func listName(_ todo: TodoItem) -> String {
        lists.first { $0.id.lowercased() == todo.listKey?.lowercased() }?.name ?? "Today"
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Masthead(title: "Done", subline: "Finished todos, by day")
                let groups = groups
                if groups.isEmpty {
                    EmptyLine(text: "Nothing done yet.")
                }
                ForEach(groups) { group in
                    VStack(alignment: .leading, spacing: 0) {
                        SectionLabel(text: group.label)
                            .padding(.bottom, 6)
                        ForEach(group.items) { todo in
                            row(todo)
                        }
                    }
                    .padding(.horizontal, Theme.Phone.gutter)
                    .padding(.top, 18)
                }
                if !groups.isEmpty {
                    Text("Tap a check to put a todo back.")
                        .textStyle(Theme.Fonts.Role.meta)
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .padding(.horizontal, Theme.Phone.gutter)
                        .padding(.vertical, Theme.Space.s3)
                }
            }
            .padding(.bottom, Theme.Space.s16)
        }
        .background(Theme.Colors.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.Colors.canvas, for: .navigationBar)
    }

    private func row(_ todo: TodoItem) -> some View {
        HStack(alignment: .top, spacing: Theme.Space.s3) {
            Checkbox(isChecked: true, isMuted: true, label: "Put \(todo.title) back") {
                withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                    actions.restoreFromDone(todo)
                }
            }
            .padding(.leading, -10)
            .padding(.trailing, -6)
            .padding(.vertical, -10)
            VStack(alignment: .leading, spacing: 3) {
                Text(todo.title)
                    .textStyle(Theme.Fonts.Role.body)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .strikethrough(true, color: Theme.Colors.inkMuted)
                    .lineLimit(3)
                Text(listName(todo))
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(todo.title)
        .accessibilityValue("Done, from \(listName(todo))")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Puts it back in \(listName(todo))")
        .accessibilityAction {
            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                actions.restoreFromDone(todo)
            }
        }
    }
}
