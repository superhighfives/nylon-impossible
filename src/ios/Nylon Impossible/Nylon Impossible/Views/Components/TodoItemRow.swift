//
//  TodoItemRow.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct TodoItemRow: View {
    let todo: TodoItem
    let apiService: APIService?
    let urls: [APITodoUrl]
    var subtasks: [TodoItem] = []
    // Every list the user can move this todo into. Empty (the default) is
    // fine for a static context like the drag preview, which never opens a
    // real edit sheet.
    var availableLists: [TodoListModel] = []
    var onToggle: () -> Void
    var onSave: (String, String?, Date?, Recurrence?, Bool) -> Void
    var onAddSubtask: (String) -> Void = { _ in }
    var onToggleSubtask: (TodoItem) -> Void = { _ in }
    var onDeleteSubtask: (TodoItem) -> Void = { _ in }
    var onMoveSubtask: (IndexSet, Int) -> Void = { _, _ in }
    var onMoveToList: (String) -> Void = { _ in }

    private var completedSubtaskCount: Int {
        subtasks.filter { $0.isCompleted }.count
    }

    @State private var checkmarkScale: CGFloat = 1.0
    @State private var showingEditSheet = false

    /// The checkbox's box size, and the nudge that lifts it onto the title's
    /// first line. Named because the trailing sync dot pins to the same line
    /// and derives its own position from them — change one and the dot follows.
    private static let checkboxSize: CGFloat = 28
    private static let checkboxNudge: CGFloat = 4
    private static let syncDotSize: CGFloat = 6

    private var nonResearchUrls: [APITodoUrl] {
        urls.filter { $0.researchId == nil }
    }

    /// The URL a title consists entirely of — a task captured as nothing but a
    /// link, whether shared in from elsewhere or typed straight into the add
    /// bar. Nil for a title that's prose, even prose containing a link.
    private var titleOnlyUrl: URL? {
        let trimmed = todo.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.contains(" "),
              let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }
        return url
    }

    /// The title, as the row renders it.
    private var titleText: Text {
        Text(todo.title)
            .font(.system(size: todo.isEffectivelyCompleted ? 13 : 16))
            .strikethrough(todo.isEffectivelyCompleted, color: Color.appSubtle)
    }

    /// The title — a real link when that's all it is, a button onto the edit
    /// sheet otherwise.
    ///
    /// A row that reads as nothing but a link should behave as one. That's all
    /// it can do until link processing gives the task a proper title and a
    /// preview card to sit under it.
    ///
    /// Both branches are real controls rather than bare text, so each carries
    /// its own role — VoiceOver announces a link as a link and a title as a
    /// button, and both are reachable and activatable without sight of the
    /// row's tap area. The container's gesture only widens the target for the
    /// space around them; it is never the sole way in.
    @ViewBuilder
    private var titleView: some View {
        if let url = titleOnlyUrl {
            Link(destination: url) {
                titleText
                    .foregroundStyle(todo.isEffectivelyCompleted ? Color.appSubtle : Color.appAccent)
                    .underline()
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open \(todo.title)")
        } else {
            Button(action: { showingEditSheet = true }) {
                titleText
                    .foregroundStyle(todo.isEffectivelyCompleted ? Color.appSubtle : Color.appDefault)
                    .animation(.easeInOut(duration: 0.2), value: todo.isEffectivelyCompleted)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the task for editing")
        }
    }

    /// Due-date + recurrence pills shown under the title, mirroring
    /// the web `TodoIndicators` row.
    @ViewBuilder
    private var indicatorBadges: some View {
        // A completed repeat has already rolled its dueDate forward to the next
        // occurrence, so show when it next comes back ("Next: Tomorrow") in
        // place of the schedule label and due-date pills. Mirrors web.
        let isCompletedRecurring = todo.isEffectivelyCompleted && todo.recurrence != nil
        if todo.dueDate != nil || todo.recurrence != nil {
            HStack(spacing: 6) {
                if isCompletedRecurring, let dueDate = todo.dueDate {
                    nextBadge(relativeDay(dueDate))
                } else {
                    if let dueDate = todo.dueDate {
                        badge(
                            dueDate.formatted(date: .abbreviated, time: .omitted),
                            foreground: todo.isOverdue ? Color.appDanger : Color.appSubtle,
                            background: todo.isOverdue ? Color.appDanger.opacity(0.15) : Color.appTint,
                            systemImage: todo.isOverdue ? "exclamationmark.circle.fill" : nil
                        )
                    }

                    if let recurrenceText = recurrenceBadgeText {
                        badge(
                            recurrenceText,
                            foreground: Color.appSubtle,
                            background: Color.appTint,
                            systemImage: "arrow.triangle.2.circlepath"
                        )
                    }
                }
            }
            .padding(.top, 2)
        }
    }

    /// "Next: Tomorrow" pill — clock on the left, repeat glyph on the right,
    /// outlined rather than filled — for a completed repeat's next occurrence.
    @ViewBuilder
    private func nextBadge(_ text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "clock")
                .font(.system(size: 10))
            Text("Next: \(text)")
                .font(.system(size: 12))
                .monospacedDigit()
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 10))
        }
        .foregroundStyle(Color.appSubtle)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color.appLine, lineWidth: 1)
        )
    }

    /// Relative calendar-day label: "Today", "Tomorrow", "Yesterday", a weekday
    /// within the coming week, else an abbreviated date ("8 Jul"). Mirrors web's
    /// `relativeDay`.
    private func relativeDay(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Today" }
        if cal.isDateInTomorrow(date) { return "Tomorrow" }
        if cal.isDateInYesterday(date) { return "Yesterday" }
        let days = cal.dateComponents(
            [.day],
            from: cal.startOfDay(for: Date()),
            to: cal.startOfDay(for: date)
        ).day ?? 0
        let formatter = DateFormatter()
        if days > 1 && days < 7 {
            formatter.dateFormat = "EEEE"
        } else {
            formatter.setLocalizedDateFormatFromTemplate("d MMM")
        }
        return formatter.string(from: date)
    }

    /// "Wed 8 Jul" — completion date for the "Completed: …" line on repeats.
    private func completedDateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("EEE d MMM")
        return formatter.string(from: date)
    }

    /// Human label for the recurrence rule ("Daily", "Weekly on Wednesday",
    /// "Monthly on the 1st", "Yearly"), anchored on the due date and using the
    /// device locale/timezone. Mirrors `recurrenceLabel` on web.
    private var recurrenceBadgeText: String? {
        guard let recurrence = todo.recurrence else { return nil }
        switch recurrence.frequency {
        case .daily:
            return "Daily"
        case .weekly:
            guard let due = todo.dueDate else { return "Weekly" }
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE"
            return "Weekly on \(formatter.string(from: due))"
        case .monthly:
            guard let due = todo.dueDate else { return "Monthly" }
            let day = Calendar.current.component(.day, from: due)
            return "Monthly on the \(ordinal(day))"
        case .yearly:
            return "Yearly"
        }
    }

    /// "1st", "2nd", "3rd", "14th" — matches web's `ordinal`.
    private func ordinal(_ n: Int) -> String {
        let mod100 = n % 100
        if (11...13).contains(mod100) { return "\(n)th" }
        switch n % 10 {
        case 1: return "\(n)st"
        case 2: return "\(n)nd"
        case 3: return "\(n)rd"
        default: return "\(n)th"
        }
    }

    @ViewBuilder
    private func badge(
        _ text: String,
        foreground: Color,
        background: Color,
        systemImage: String? = nil
    ) -> some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 10))
            }
            Text(text)
                .font(.system(size: 12))
                .monospacedDigit()
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(background, in: RoundedRectangle(cornerRadius: 6))
    }

    var body: some View {
        // Top-aligned, not center — matches web's `items-start` row (the
        // checkbox pins to the title's first line instead of floating at the
        // vertical center of the whole row, which looks off once badges or a
        // wrapped title make the row taller than the checkbox).
        HStack(alignment: .top, spacing: 16) {
            // Checkbox
            Button(action: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    checkmarkScale = 1.3
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                        checkmarkScale = 1.0
                    }
                }

                withAnimation(.easeInOut(duration: 0.2)) {
                    onToggle()
                }
            }) {
                // Rounded square, not a circle — matches web's Checkbox
                // (rounded-md, border-2 border-gray-12), including the brand
                // yellow fill on completion (web fills accent-solid with a
                // dark checkmark instead of a muted gray).
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(
                            todo.isEffectivelyCompleted ? Color.clear : Color.appDefault,
                            lineWidth: 2.5
                        )
                        .frame(width: Self.checkboxSize, height: Self.checkboxSize)

                    if todo.isEffectivelyCompleted {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color.appBrand)
                            .frame(width: Self.checkboxSize, height: Self.checkboxSize)

                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Color.appBrandForeground)
                            .scaleEffect(checkmarkScale)
                    }
                }
            }
            .buttonStyle(.plain)
            // The 28pt box is taller than one line of the 16pt title, so
            // top-aligning them outright would sit the box a few points below
            // the title's optical center; nudge it back up — the iOS analogue
            // of web's `mt-[3px]` push (there the checkbox is the *smaller*
            // one, so it nudges the other way to reach the same centering).
            .offset(y: -Self.checkboxNudge)

            // Task content — tappable to edit.
            //
            // The tap is an `onTapGesture` on the container rather than a
            // Button wrapping it: the links inside (the title when it's a bare
            // URL, and the preview cards) are real `Link`s, and a `Link` nested
            // inside a `.plain` Button's label never receives the tap. As a
            // sibling gesture the links win within their own bounds and the
            // container catches everything else.
            //
            // It's extra hit area, not the only way in: the title is itself a
            // Button, so the edit sheet stays reachable with the role and
            // activation VoiceOver expects. A gesture on a container carries no
            // such semantics on its own.
            VStack(alignment: .leading, spacing: 4) {
                // Title row with AI status.
                HStack(spacing: 6) {
                    titleView

                    // AI processing indicator
                    if todo.isAIProcessing {
                        ProgressView()
                            .scaleEffect(0.7)
                            .tint(Color.appSubtle)
                            .accessibilityLabel("AI is processing")
                    }

                    // Research pending indicator
                    if !todo.isAIProcessing && todo.isResearchPending {
                        ProgressView()
                            .scaleEffect(0.7)
                            .tint(Color.appAccent)
                            .accessibilityLabel("Researching")
                    }

                    // Agent has a question awaiting the user's reply
                    if todo.needsInput {
                        Image(systemName: "bubble.left.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.appAccent)
                            .accessibilityLabel("The assistant has a question")
                    }

                    // Agent has proposed changes awaiting review
                    if todo.hasPendingSuggestions {
                        Circle()
                            .fill(Color.appAccent)
                            .frame(width: 8, height: 8)
                            .accessibilityLabel("AI has suggestions")
                    }

                    // Subtask progress (n/m), mirroring the web badge.
                    if !subtasks.isEmpty {
                        HStack(spacing: 3) {
                            Image(systemName: "list.bullet.indent")
                                .font(.system(size: 10))
                            Text("\(completedSubtaskCount)/\(subtasks.count)")
                                .font(.system(size: 12))
                                .monospacedDigit()
                        }
                        .foregroundStyle(Color.appSubtle)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.appTint, in: RoundedRectangle(cornerRadius: 6))
                        .accessibilityLabel("\(completedSubtaskCount) of \(subtasks.count) subtasks complete")
                    }

                    Spacer()

                    if !todo.isSynced {
                        // Level with the checkbox, not with the title. This
                        // row is center-aligned, so on a title that wraps the
                        // dot would sit halfway down the block — level with
                        // the second line of three, floating in the middle of
                        // nothing. Pin it to the top of the row instead and
                        // drop it onto the checkbox's center, which is
                        // `checkboxSize / 2` down and `checkboxNudge` back up.
                        // The offset is draw-only and the dot keeps its 6pt
                        // footprint, so nothing here can change the row's
                        // height.
                        Circle()
                            .fill(Color.appSubtle)
                            .frame(width: Self.syncDotSize, height: Self.syncDotSize)
                            .offset(
                                y: Self.checkboxSize / 2
                                    - Self.checkboxNudge
                                    - Self.syncDotSize / 2
                            )
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                }

                if todo.isEffectivelyCompleted {
                    // Completion date for any completed todo. Repeats stamp
                    // completedAt; normal/legacy todos fall back to updatedAt
                    // (≈ completion time). Matches web.
                    Text("Completed: \(completedDateText(todo.completedAt ?? todo.updatedAt))")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.appSubtle)

                    // Full note/research/link previews collapse to compact
                    // outline badges once done. Matches web.
                    CompletedContentBadges(todo: todo, linkCount: nonResearchUrls.count)
                } else if !nonResearchUrls.isEmpty {
                    // URL cards (compact) — hide research URLs, limit to 2 visible
                    FlowLayout(spacing: 6) {
                        ForEach(Array(nonResearchUrls.prefix(2))) { url in
                            UrlRowCompact(url: url)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if nonResearchUrls.count > 2 {
                        Text("+\(nonResearchUrls.count - 2) \(nonResearchUrls.count - 2 == 1 ? "link" : "links")")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.appSubtle)
                    }
                }

                // Due-date badges — labeled pills, matching
                // web's indicator row.
                indicatorBadges
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture { showingEditSheet = true }

            // Pinned indicator — state, not an action. The toggle itself now
            // lives in the row's leading swipe action (see `TaskListView`),
            // mirroring web: "a pinned todo keeps its pin visible... the pin
            // affordance on unpinned rows is hover-revealed" — an unpinned
            // row carries no persistent pin control at all, only the
            // swipe-revealed one. Non-interactive here since a tap would
            // fight the container's own tap-to-edit gesture.
            if todo.sticky {
                Image(systemName: "pin.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.appAccent)
                    .accessibilityLabel("Pinned")
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        // No persistent box — rows sit directly on the background so they read
        // as floating (matching web, where the surface/ring only appears while
        // a row is being dragged). The Liquid Glass drag lift is supplied by
        // `ContentView.dragPreview`, not by a box on the resting row.
        .opacity(todo.isEffectivelyCompleted ? 0.7 : 1.0)
        .contentShape(Rectangle())
        // No `.contextMenu` here: its long-press gesture collides with the
        // row's `.draggable` lift (also long-press), so the share popover
        // would hijack a drag. Sharing stays available from the edit sheet.
        .sheet(isPresented: $showingEditSheet) {
            TodoEditSheet(
                todo: todo,
                apiService: apiService,
                initialUrls: urls,
                subtasks: subtasks,
                availableLists: availableLists,
                onSave: { title, notes, dueDate, recurrence, sticky in
                    onSave(title, notes, dueDate, recurrence, sticky)
                    showingEditSheet = false
                },
                onCancel: {
                    showingEditSheet = false
                },
                onAddSubtask: onAddSubtask,
                onToggleSubtask: onToggleSubtask,
                onDeleteSubtask: onDeleteSubtask,
                onMoveSubtask: onMoveSubtask,
                onMoveToList: onMoveToList
            )
        }
    }

}

/// Outline badges summarizing a completed todo's content — notes, research,
/// links — in place of the full previews shown while it's active. Mirrors
/// web's `CompletedContentBadges`.
private struct CompletedContentBadges: View {
    let todo: TodoItem
    let linkCount: Int

    var body: some View {
        let hasNotes = !(todo.itemNotes?
            .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
            .isEmpty ?? true)
        let hasResearch = todo.researchStatus == "completed"
            && !(todo.researchSummary?.isEmpty ?? true)
        if hasNotes || hasResearch || linkCount > 0 {
            FlowLayout(spacing: 6) {
                if hasNotes {
                    badge("Notes", systemImage: "doc.text")
                }
                if hasResearch {
                    badge("Research", systemImage: "sparkles")
                }
                if linkCount > 0 {
                    badge(
                        "\(linkCount) \(linkCount == 1 ? "link" : "links")",
                        systemImage: "link"
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Single icon + label outline badge — the shared shape behind the completed
    /// content badges.
    @ViewBuilder
    private func badge(_ text: String, systemImage: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
                .font(.system(size: 10))
            Text(text)
                .font(.system(size: 12))
                .monospacedDigit()
        }
        .foregroundStyle(Color.appSubtle)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color.appLine, lineWidth: 1)
        )
    }
}

#Preview {
    ZStack {
        GradientBackground()
        VStack(spacing: 12) {
            TodoItemRow(
                todo: {
                    let item = TodoItem(title: "Buy groceries")
                    item.dueDate = Date().addingTimeInterval(86400)
                    return item
                }(),
                apiService: nil,
                urls: [],
                onToggle: {},
                onSave: { _, _, _, _, _ in }
            )
            TodoItemRow(
                todo: {
                    let item = TodoItem(title: "Research dogs")
                    item.isCompleted = true
                    item.researchStatus = "completed"
                    item.researchSummary = "Domestic dogs evolved from wolves…"
                    item.itemNotes = "Follow up on breed groups"
                    return item
                }(),
                apiService: nil,
                urls: [],
                onToggle: {},
                onSave: { _, _, _, _, _ in }
            )
            TodoItemRow(
                todo: {
                    let item = TodoItem(title: "Gym")
                    item.recurrenceFrequency = "daily"
                    item.completedAt = Date()
                    item.dueDate = Date().addingTimeInterval(86400)
                    return item
                }(),
                apiService: nil,
                urls: [],
                onToggle: {},
                onSave: { _, _, _, _, _ in }
            )
            TodoItemRow(
                todo: {
                    let item = TodoItem(title: "Overdue task")
                    item.dueDate = Date().addingTimeInterval(-86400)
                    return item
                }(),
                apiService: nil,
                urls: [],
                onToggle: {},
                onSave: { _, _, _, _, _ in }
            )
            // Unsynced (a new TodoItem starts that way) with a title long
            // enough to wrap — the sync dot should stay level with the
            // checkbox rather than drift to the middle line.
            TodoItemRow(
                todo: TodoItem(
                    title: "Add a way to show new models on the gateway overview, preferably as part of the rest api"
                ),
                apiService: nil,
                urls: [],
                onToggle: {},
                onSave: { _, _, _, _, _ in }
            )
        }
        .padding()
    }
}
