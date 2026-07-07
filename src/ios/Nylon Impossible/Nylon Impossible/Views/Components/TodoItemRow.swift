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
    var onToggle: () -> Void
    var onSave: (String, String?, Date?, TodoPriority?, Recurrence?) -> Void

    @State private var checkmarkScale: CGFloat = 1.0
    @State private var showingEditSheet = false

    private var nonResearchUrls: [APITodoUrl] {
        urls.filter { $0.researchId == nil }
    }

    /// Priority + due-date + recurrence pills shown under the title, mirroring
    /// the web `TodoIndicators` row. Only explicit priorities render a badge.
    @ViewBuilder
    private var indicatorBadges: some View {
        let priority = todo.todoPriority
        if priority != nil || todo.dueDate != nil || todo.recurrence != nil {
            HStack(spacing: 6) {
                if let priority {
                    badge(
                        priority == .high ? "High" : "Low",
                        foreground: priority == .high ? Color.appAccent : Color.appSubtle,
                        background: priority == .high ? Color.appBrand.opacity(0.22) : Color.appTint
                    )
                }

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
            .padding(.top, 2)
        }
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
        HStack(spacing: 16) {
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
                ZStack {
                    Circle()
                        .stroke(
                            todo.isEffectivelyCompleted ? Color.clear : Color.appLine,
                            lineWidth: 2.5
                        )
                        .frame(width: 28, height: 28)

                    if todo.isEffectivelyCompleted {
                        Circle()
                            .fill(Color.appSubtle.opacity(0.4))
                            .frame(width: 28, height: 28)

                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Color.appSubtle)
                            .scaleEffect(checkmarkScale)
                    }
                }
            }
            .buttonStyle(.plain)

            // Task content — tappable to edit
            Button(action: {
                showingEditSheet = true
            }) {
                VStack(alignment: .leading, spacing: 4) {
                    // Title row with AI status. Priority is shown as a labeled
                    // badge below the title (see indicators row), matching web.
                    HStack(spacing: 6) {
                        Text(todo.title)
                            .font(.system(size: todo.isEffectivelyCompleted ? 13 : 16))
                            .foregroundStyle(todo.isEffectivelyCompleted ? Color.appSubtle : Color.appDefault)
                            .strikethrough(todo.isEffectivelyCompleted, color: Color.appSubtle)
                            .animation(.easeInOut(duration: 0.2), value: todo.isEffectivelyCompleted)
                        
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

                        Spacer()
                        if !todo.isSynced {
                            Circle()
                                .fill(Color.appSubtle)
                                .frame(width: 6, height: 6)
                        }
                    }
                    
                    // URL cards (compact) — hide research URLs, limit to 2 visible
                    if !nonResearchUrls.isEmpty {
                        if todo.isEffectivelyCompleted {
                            Text("+\(nonResearchUrls.count) \(nonResearchUrls.count == 1 ? "link" : "links")")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.appSubtle)
                        } else {
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
                    }

                    // Priority and due-date badges — labeled pills, matching
                    // web's indicator row.
                    indicatorBadges
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .glassEffect(.regular, in: .rect(cornerRadius: 14))
        .opacity(todo.isEffectivelyCompleted ? 0.7 : 1.0)
        .contentShape(Rectangle())
        .contextMenu {
            ShareLink(item: shareText(for: todo, urls: urls))
        }
        .sheet(isPresented: $showingEditSheet) {
            TodoEditSheet(
                todo: todo,
                apiService: apiService,
                initialUrls: urls,
                onSave: { title, notes, dueDate, priority, recurrence in
                    onSave(title, notes, dueDate, priority, recurrence)
                    showingEditSheet = false
                },
                onCancel: {
                    showingEditSheet = false
                }
            )
        }
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
                    item.priority = "high"
                    return item
                }(),
                apiService: nil,
                urls: [],
                onToggle: {},
                onSave: { _, _, _, _, _ in }
            )
            TodoItemRow(
                todo: {
                    let item = TodoItem(title: "Complete project")
                    item.isCompleted = true
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
        }
        .padding()
    }
}
