//
//  TodayWidgetView.swift
//  Nylon Impossible
//
//  Created by Claude on 8/27/26.
//
//  The Today widget on the Home Screen and the Lock Screen. Home Screen rows
//  are the app's row anatomy at widget scale: the checkbox (which marks the
//  todo done in place), the title, and one meta line. The header carries the
//  count and a "+" that opens the app with the composer focused on Today.
//
//  Compiled into the app as well, so the DEBUG screenshot route draws these
//  same views; `family` lets it pick a size the environment can't set there.
//

// `Button(intent:label:)` is defined in the AppIntents/SwiftUI cross-import
// overlay, and the project builds with MemberImportVisibility — so the module
// that defines a member has to be imported where the member is used, even
// though the type comes from SwiftUI.
import AppIntents
import SwiftUI
import WidgetKit

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var environmentFamily

    let entry: TodayEntry
    /// Overrides the environment's family (the screenshot route).
    var family: WidgetFamily?

    private var resolvedFamily: WidgetFamily { family ?? environmentFamily }

    var body: some View {
        switch resolvedFamily {
        case .accessoryCircular: TodayCircularView(entry: entry)
        case .accessoryRectangular: TodayRectangularView(entry: entry)
        case .accessoryInline: TodayInlineView(entry: entry)
        default: home
        }
    }

    // MARK: - Home Screen

    private var home: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            switch entry.content {
            case .signedOut:
                header(count: nil, showsAdd: false)
                message("Sign in to see your day")
            case .todos(let todos, let total):
                header(count: total, showsAdd: true)
                if todos.isEmpty {
                    message("Nothing for today")
                } else {
                    rows(todos, total: total)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func header(count: Int?, showsAdd: Bool) -> some View {
        HStack(alignment: .center, spacing: Theme.Space.s2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Today")
                    .font(Theme.Fonts.Phone.title.font)
                    .foregroundStyle(Theme.Colors.ink)
                if let count, count > 0 {
                    Text("\(count)")
                        .font(Theme.Fonts.Phone.meta.font.weight(.medium))
                        .monospacedDigit()
                        .foregroundStyle(Theme.Colors.inkMuted)
                }
            }
            // "Today, 4" as one label rather than two neighbours.
            .accessibilityElement(children: .combine)

            Spacer(minLength: 0)

            if showsAdd {
                // A widget can't take text, so "+" opens the app with the
                // composer focused on Today — the composer's yellow send
                // button, scaled down.
                Button(intent: OpenComposerIntent(list: .today)) {
                    Image(systemName: Theme.Icon.add)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.Colors.brandInk)
                        .frame(width: 28, height: 28)
                        .background(Theme.Colors.brand, in: Circle())
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("New todo")
            }
        }
    }

    @ViewBuilder
    private func rows(_ todos: [WidgetTodo], total: Int) -> some View {
        let count = TodayWidgetLayout.fit(todos, total: total, budget: TodayWidgetLayout.budget(for: resolvedFamily))
        let shown = Array(todos.prefix(count))
        VStack(alignment: .leading, spacing: TodayWidgetLayout.rowSpacing) {
            ForEach(shown) { todo in
                TodayRow(todo: todo)
            }
            // Honest remainder: the entry counts everything for today and
            // only carries the first few, so this is the number actually left.
            if total > shown.count {
                Text("+\(total - shown.count) more")
                    .font(Theme.Fonts.Phone.meta.font)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .padding(.leading, TodayRow.titleInset)
            }
        }
    }

    private func message(_ text: String) -> some View {
        VStack(alignment: .leading) {
            Spacer(minLength: 0)
            Text(text)
                .font(Theme.Fonts.Wide.body.font)
                .foregroundStyle(Theme.Colors.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The app's row at widget scale: checkbox, title, one meta line.
private struct TodayRow: View {
    let todo: WidgetTodo

    static let checkbox: CGFloat = 18
    static let gap: CGFloat = Theme.Space.s2
    static var titleInset: CGFloat { checkbox + gap }

    var body: some View {
        HStack(alignment: .top, spacing: Self.gap) {
            Button(intent: CompleteTodoIntent(todoId: todo.id.uuidString)) {
                // The app's unchecked box (radius 7/24 of its size). There's
                // no checked state to draw — marking a todo done takes it off
                // the list this widget shows.
                RoundedRectangle(cornerRadius: Self.checkbox * 7 / 24, style: .continuous)
                    .strokeBorder(Theme.Colors.ink, lineWidth: 1.5)
                    .frame(width: Self.checkbox, height: Self.checkbox)
                    .padding(.top, 1)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Mark \(todo.title) done")

            VStack(alignment: .leading, spacing: 0) {
                Text(todo.title)
                    .font(Theme.Fonts.Wide.body.font.weight(.medium))
                    .foregroundStyle(Theme.Colors.ink)
                    .lineLimit(1)
                    .frame(height: TodayWidgetLayout.titleHeight, alignment: .leading)
                if !todo.meta.isEmpty {
                    WidgetMetaLine(parts: todo.meta)
                        .frame(height: TodayWidgetLayout.metaHeight, alignment: .leading)
                }
            }
        }
    }
}

/// The row's meta line in one line: the same parts, words and colours as the
/// app's `MetaLine`, without its wrapping.
struct WidgetMetaLine: View {
    let parts: [MetaPart]

    var body: some View {
        HStack(spacing: Theme.Space.s2) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                item(part)
            }
        }
        .font(Theme.Fonts.Phone.meta.font)
        .foregroundStyle(Theme.Colors.inkMuted)
        .lineLimit(1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TodoMeta.accessibilityText(parts))
    }

    @ViewBuilder
    private func item(_ part: MetaPart) -> some View {
        switch part {
        case .pinned:
            glyphed(Theme.Icon.pin, "Pinned")
        case .due(let text, let overdue):
            Text(text)
                .fontWeight(overdue ? .medium : .regular)
                .foregroundStyle(overdue ? Theme.Colors.overdue : Theme.Colors.inkMuted)
                .monospacedDigit()
        case .repeats(let text):
            glyphed(Theme.Icon.repeat, text)
        case .subtasks(let done, let total):
            glyphed(Theme.Icon.subtasks, "\(done)/\(total)")
        case .notes:
            Image(systemName: Theme.Icon.notes).imageScale(.small)
        case .link(let domain):
            glyphed(Theme.Icon.link, domain)
        }
    }

    private func glyphed(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: symbol).imageScale(.small)
            Text(text)
        }
    }
}

// MARK: - Lock Screen

/// The day's count in a ring, the way the system's own circular complications
/// read. Tapping it opens the app.
private struct TodayCircularView: View {
    let entry: TodayEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: -1) {
                switch entry.content {
                case .signedOut:
                    Image(systemName: Theme.Icon.add)
                        .font(.system(size: 18, weight: .semibold))
                case .todos(_, let total):
                    Text("\(total)")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                    Text("Today")
                        .font(.system(size: 9, weight: .semibold))
                        .textCase(.uppercase)
                }
            }
        }
        .widgetURL(DeepLink.add(list: .today).url)
        .accessibilityElement(children: .combine)
    }
}

/// "Today · 4" over the next todo and its meta. Tapping it opens the app
/// with the composer ready.
private struct TodayRectangularView: View {
    let entry: TodayEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            switch entry.content {
            case .signedOut:
                Text("Nylon").font(.headline)
                Text("Sign in to see your day").font(.caption)
            case .todos(let todos, let total):
                Text(total == 0 ? "Today" : "Today · \(total)")
                    .font(.headline)
                    .widgetAccentable()
                if let next = todos.first {
                    Text(next.title)
                        .font(.body)
                        .lineLimit(1)
                    if !next.meta.isEmpty {
                        WidgetMetaLine(parts: next.meta)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("Nothing for today").font(.body).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(DeepLink.add(list: .today).url)
    }
}

/// One line above the clock: "4 today · Renew passport".
private struct TodayInlineView: View {
    let entry: TodayEntry

    var body: some View {
        switch entry.content {
        case .signedOut:
            Text("Nylon")
        case .todos(let todos, let total):
            if let next = todos.first {
                Text("\(total) today · \(next.title)")
            } else {
                Text("Nothing for today")
            }
        }
    }
}
