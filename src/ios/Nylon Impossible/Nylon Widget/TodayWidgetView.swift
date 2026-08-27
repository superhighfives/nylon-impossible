//
//  TodayWidgetView.swift
//  Nylon Widget
//
//  Created by Claude on 8/27/26.
//

import SwiftUI
import WidgetKit

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family

    let entry: TodayEntry

    /// The small family is a third the width, and loses a row to the tighter
    /// layout rather than to height.
    private var rowLimit: Int {
        family == .systemSmall ? 3 : TodayProvider.maxRows
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch entry.content {
            case .signedOut:
                header(count: nil)
                message("Sign in to see what's due", systemImage: "person.crop.circle")
            case .todos(let todos, let total):
                header(count: total)
                if todos.isEmpty {
                    message("Nothing due today", systemImage: "checkmark.circle")
                } else {
                    rows(todos, total: total)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: - Pieces

    private func header(count: Int?) -> some View {
        HStack(spacing: 6) {
            Text("Today")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.appDefault)
            if let count, count > 0 {
                Text("\(count)")
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Color.appBrandForeground)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Color.appBrand, in: Capsule())
            }
            Spacer(minLength: 0)
        }
        // The count is already in the badge beside the word; VoiceOver reading
        // "Today, 4" as one label beats it reading them as two neighbours.
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func rows(_ todos: [WidgetTodo], total: Int) -> some View {
        let shown = Array(todos.prefix(rowLimit))
        VStack(alignment: .leading, spacing: 2) {
            ForEach(shown) { todo in
                TodayRow(todo: todo, now: entry.date, isCompact: family == .systemSmall)
            }
            // Honest remainder: the provider counts everything due and only
            // caps what it carries, so this is the number of todos actually
            // left rather than the number that didn't fit in the fetch.
            if total > shown.count {
                Text("+\(total - shown.count) more")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.appSubtle)
                    .padding(.leading, 26)
                    .padding(.top, 2)
            }
            Spacer(minLength: 0)
        }
    }

    private func message(_ text: String, systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            Image(systemName: systemImage)
                .font(.system(size: 18))
                .foregroundStyle(Color.appSubtle)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Color.appStrong)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TodayRow: View {
    let todo: WidgetTodo
    let now: Date
    let isCompact: Bool

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: CompleteTodoIntent(todoId: todo.id.uuidString)) {
                // The app's unchecked circle, scaled to a widget row. There's
                // no checked state to draw — completing a todo takes it off
                // the list this widget is showing.
                Circle()
                    .stroke(Color.appLine, lineWidth: 2)
                    .frame(width: 16, height: 16)
                    // Only the 2pt stroke is visible, so the tap gets the
                    // whole row-height square to land in.
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Complete \(todo.title)")

            Text(todo.title)
                .font(.system(size: 13))
                .foregroundStyle(Color.appDefault)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 4)

            trailing
        }
    }

    /// Overdue is the one thing worth the space, drawn the way the app's row
    /// draws it. Everything here is due today by definition, so a date on each
    /// row would say the same thing four times over — but a todo that's late
    /// is a different fact, and `TodoItem.isOverdue`'s rule (any due date now
    /// past) is the one the app already shows in red.
    @ViewBuilder
    private var trailing: some View {
        HStack(spacing: 4) {
            if todo.isRepeating {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 9))
                    .foregroundStyle(Color.appSubtle)
            }
            if todo.isSticky {
                Image(systemName: "pin.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(Color.appSubtle)
            }
            if todo.isOverdue(at: now) {
                Label {
                    if let overdueDate {
                        Text(overdueDate)
                    }
                } icon: {
                    Image(systemName: "exclamationmark.circle.fill")
                }
                .font(.system(size: 10))
                .foregroundStyle(Color.appDanger)
                .labelStyle(.titleAndIcon)
                .accessibilityLabel("Overdue")
            }
        }
    }

    /// How late, for the rows with room to say. Only for a due date from a
    /// previous day: a todo due today at midnight counts as overdue from
    /// 00:01, and printing today's date next to a widget headed "Today" says
    /// nothing the red icon hasn't already.
    private var overdueDate: String? {
        guard !isCompact, let dueDate = todo.dueDate else { return nil }
        guard !Calendar.current.isDate(dueDate, inSameDayAs: now) else { return nil }
        return dueDate.formatted(date: .abbreviated, time: .omitted)
    }
}
