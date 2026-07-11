//
//  TodoEditSheet.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import SwiftUI

struct TodoEditSheet: View {
    let todo: TodoItem
    let apiService: APIService?
    let subtasks: [TodoItem]
    var onSave: (String, String?, Date?, TodoPriority?, Recurrence?) -> Void
    var onCancel: () -> Void
    var onAddSubtask: (String) -> Void
    var onToggleSubtask: (TodoItem) -> Void
    var onDeleteSubtask: (TodoItem) -> Void
    var onMoveSubtask: (IndexSet, Int) -> Void

    @Environment(UserPreferencesService.self) private var preferencesService
    @State private var title: String
    @State private var notes: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var priority: TodoPriority?
    @State private var recurrenceFrequency: RecurrenceFrequency?
    @State private var urls: [APITodoUrl] = []
    @State private var research: APIResearch?
    @State private var isLoadingUrls: Bool = false
    @State private var isReresearching: Bool = false
    @State private var newSubtaskTitle: String = ""

    init(
        todo: TodoItem,
        apiService: APIService? = nil,
        initialUrls: [APITodoUrl] = [],
        subtasks: [TodoItem] = [],
        onSave: @escaping (String, String?, Date?, TodoPriority?, Recurrence?) -> Void,
        onCancel: @escaping () -> Void,
        onAddSubtask: @escaping (String) -> Void = { _ in },
        onToggleSubtask: @escaping (TodoItem) -> Void = { _ in },
        onDeleteSubtask: @escaping (TodoItem) -> Void = { _ in },
        onMoveSubtask: @escaping (IndexSet, Int) -> Void = { _, _ in }
    ) {
        self.todo = todo
        self.apiService = apiService
        self.subtasks = subtasks
        self.onSave = onSave
        self.onCancel = onCancel
        self.onAddSubtask = onAddSubtask
        self.onToggleSubtask = onToggleSubtask
        self.onDeleteSubtask = onDeleteSubtask
        self.onMoveSubtask = onMoveSubtask

        _title = State(initialValue: todo.title)
        _notes = State(initialValue: todo.itemNotes ?? "")
        _hasDueDate = State(initialValue: todo.dueDate != nil)
        _dueDate = State(initialValue: todo.dueDate ?? Date())
        _priority = State(initialValue: todo.todoPriority)
        _recurrenceFrequency = State(initialValue: todo.recurrence?.frequency)
        _urls = State(initialValue: initialUrls)
        let initialResearch: APIResearch?
        if let researchId = todo.researchId {
            initialResearch = APIResearch(
                id: researchId,
                status: todo.researchStatus ?? "pending",
                researchType: todo.researchType ?? "general",
                summary: todo.researchSummary,
                researchedAt: todo.researchedAt,
                createdAt: todo.researchCreatedAt ?? Date()
            )
        } else {
            initialResearch = nil
        }
        _research = State(initialValue: initialResearch)
    }
    
    var body: some View {
        NavigationStack {
            Form {
                // Title
                Section {
                    TextField("Task title", text: $title)
                        .font(.headline)
                } header: {
                    Text("Title")
                }
                
                // Notes
                Section {
                    TextField("Add a note...", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    HStack {
                        Text("Notes")
                        Spacer()
                        if preferencesService.aiEnabled {
                            Text("Not used by AI")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                
                // Due Date
                Section {
                    Toggle("Set due date", isOn: $hasDueDate)
                    
                    if hasDueDate {
                        DatePicker(
                            "Due date",
                            selection: $dueDate,
                            displayedComponents: .date
                        )
                    }
                } header: {
                    Text("Due Date")
                }
                
                // Priority
                Section {
                    Picker("Priority", selection: $priority) {
                        Text("None").tag(nil as TodoPriority?)
                        Text("High").tag(TodoPriority.high as TodoPriority?)
                        Text("Low").tag(TodoPriority.low as TodoPriority?)
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Priority")
                }

                // Recurrence — disabled until a due date is set, since the
                // rule has no anchor without one. Hidden when the todo has
                // subtasks: recurrence and subtasks are mutually exclusive.
                if subtasks.isEmpty {
                    Section {
                        Picker("Repeat", selection: $recurrenceFrequency) {
                            Text("None").tag(nil as RecurrenceFrequency?)
                            Text(weeklyLabel).tag(RecurrenceFrequency.weekly as RecurrenceFrequency?)
                            Text("Daily").tag(RecurrenceFrequency.daily as RecurrenceFrequency?)
                            Text(monthlyLabel).tag(RecurrenceFrequency.monthly as RecurrenceFrequency?)
                            Text("Yearly").tag(RecurrenceFrequency.yearly as RecurrenceFrequency?)
                        }
                        .pickerStyle(.menu)
                        .disabled(!hasDueDate)
                    } header: {
                        Text("Repeat")
                    } footer: {
                        if !hasDueDate {
                            Text("Set a due date to enable repeats.")
                        }
                    }
                    .onChange(of: hasDueDate) { _, hasDate in
                        if !hasDate { recurrenceFrequency = nil }
                    }
                }

                // Subtasks — hidden on a recurring todo (mutually exclusive with
                // recurrence). Once a subtask is added, the Repeat section hides.
                if todo.recurrence == nil {
                    subtasksSection
                }

                // Research
                if let research {
                    ResearchSection(
                        research: research,
                        researchUrls: urls.filter { $0.researchId != nil },
                        onReresearch: { await reresearch() },
                        onCancelResearch: { await cancelResearch() }
                    )
                }

                // Conversation — agent questions and the user's replies
                ConversationSection(todo: todo, apiService: apiService)

                // Links (non-research URLs only)
                let regularUrls = urls.filter { $0.researchId == nil }
                if isLoadingUrls && urls.isEmpty {
                    Section {
                        HStack {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("Loading links...")
                                .foregroundStyle(.secondary)
                        }
                    } header: {
                        Text("Links")
                    }
                } else if !regularUrls.isEmpty {
                    Section {
                        ForEach(regularUrls) { url in
                            UrlRow(url: url)
                        }
                    } header: {
                        Text("Links (\(regularUrls.count))")
                    }
                }
            }
            .task {
                await loadUrls()
            }
            .navigationTitle("Edit Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: shareText(for: todo, urls: urls))
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveChanges()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
    
    // Active subtasks order by position; completed sink to the bottom.
    private var activeSubtasks: [TodoItem] {
        subtasks.filter { !$0.isCompleted }.sorted { $0.position < $1.position }
    }

    private var completedSubtasks: [TodoItem] {
        subtasks.filter { $0.isCompleted }.sorted { $0.position < $1.position }
    }

    @ViewBuilder
    private var subtasksSection: some View {
        Section {
            ForEach(activeSubtasks) { subtask in
                subtaskRow(subtask)
            }
            .onMove(perform: onMoveSubtask)
            .onDelete { offsets in
                for index in offsets { onDeleteSubtask(activeSubtasks[index]) }
            }

            // Completed subtasks pinned to the bottom, not reorderable.
            ForEach(completedSubtasks) { subtask in
                subtaskRow(subtask)
                    .moveDisabled(true)
            }
            .onDelete { offsets in
                for index in offsets { onDeleteSubtask(completedSubtasks[index]) }
            }

            HStack(spacing: 8) {
                Image(systemName: "plus.circle.fill")
                    .foregroundStyle(Color.appSubtle)
                TextField("Add a subtask...", text: $newSubtaskTitle)
                    .onSubmit(addSubtask)
                if !newSubtaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button("Add", action: addSubtask)
                        .font(.caption)
                }
            }
        } header: {
            HStack {
                Text("Subtasks")
                if !subtasks.isEmpty {
                    Spacer()
                    Text("\(completedSubtasks.count)/\(subtasks.count)")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func subtaskRow(_ subtask: TodoItem) -> some View {
        Button {
            onToggleSubtask(subtask)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: subtask.isCompleted ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(subtask.isCompleted ? Color.appSubtle : Color.appLine)
                Text(subtask.title)
                    .foregroundStyle(subtask.isCompleted ? Color.appSubtle : Color.appDefault)
                    .strikethrough(subtask.isCompleted, color: Color.appSubtle)
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func addSubtask() {
        let trimmed = newSubtaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onAddSubtask(trimmed)
        newSubtaskTitle = ""
    }

    private func saveChanges() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let notesValue = trimmedNotes.isEmpty ? nil : trimmedNotes
        let dueDateValue = hasDueDate ? dueDate : nil
        let recurrenceValue: Recurrence? = (hasDueDate && recurrenceFrequency != nil)
            ? Recurrence(frequency: recurrenceFrequency!)
            : nil

        onSave(trimmedTitle, notesValue, dueDateValue, priority, recurrenceValue)
    }

    /// "Weekly on Wednesday" — anchor is derived from the due date so the user
    /// doesn't need to pick a weekday separately.
    private var weeklyLabel: String {
        guard hasDueDate else { return "Weekly" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return "Weekly on \(formatter.string(from: dueDate))"
    }

    /// "Monthly on the 14th" — derived from the due date's day-of-month.
    private var monthlyLabel: String {
        guard hasDueDate else { return "Monthly" }
        let day = Calendar.current.component(.day, from: dueDate)
        return "Monthly on the \(ordinal(day))"
    }

    private func ordinal(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .ordinal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
    
    private func reresearch() async {
        guard let apiService else { return }
        isReresearching = true
        defer { isReresearching = false }
        do {
            try await apiService.reresearch(todoId: todo.id.uuidString.lowercased())
            // Mark research as pending again immediately for responsive UI
            research = research.map { APIResearch(
                id: $0.id, status: "pending", researchType: $0.researchType,
                summary: $0.summary, researchedAt: $0.researchedAt, createdAt: Date()
            )}
            // Reload todo detail to pick up new research record
            await loadUrls()
        } catch {
            print("[Research] Re-research error: \(error)")
        }
    }

    private func cancelResearch() async {
        guard let apiService else { return }
        do {
            try await apiService.cancelResearch(todoId: todo.id.uuidString.lowercased())
        } catch {
            print("[Research] Cancel research error: \(error)")
        }
        await loadUrls()
    }

    private func loadUrls() async {
        guard let apiService = apiService else { return }

        // Fetch if this is the first load (no URLs yet, or research exists but its
        // source URLs haven't arrived yet), or if there are pending items to resolve.
        let hasPendingUrls = urls.contains(where: { $0.fetchStatus == .pending })
        let hasPendingResearch = research?.status == "pending"
        let needsInitialLoad: Bool = urls.isEmpty || {
            guard let researchId = research?.id else { return false }
            return !urls.contains(where: { $0.researchId == researchId })
        }()
        guard needsInitialLoad || hasPendingUrls || hasPendingResearch || isReresearching else { return }

        isLoadingUrls = true
        defer { isLoadingUrls = false }

        do {
            let todoWithUrls = try await apiService.getTodo(id: todo.id)
            urls = todoWithUrls.urls
            research = todoWithUrls.research
        } catch {
            // Silently fail - URLs and research are supplementary info
            print("Failed to load todo detail: \(error)")
        }
    }
}

// MARK: - URL Row

struct UrlRow: View {
    let url: APITodoUrl
    
    /// Pending URLs older than this threshold are treated as failed (worker likely restarted)
    private static let stalePendingThreshold: TimeInterval = 30
    
    /// Check if a pending URL is stale (fetch likely lost due to worker restart)
    private var isStale: Bool {
        url.fetchStatus == .pending &&
        Date().timeIntervalSince(url.createdAt) > Self.stalePendingThreshold
    }
    
    private var isPending: Bool {
        url.fetchStatus == .pending && !isStale
    }
    
    private var isFailed: Bool {
        url.fetchStatus == .failed || isStale
    }
    
    private var displayTitle: String {
        // Show hostname for pending/failed, full title when fetched
        if isPending || isFailed {
            return URL(string: url.url)?.host ?? url.url
        }
        if let title = url.title, !title.isEmpty {
            return title
        }
        if let siteName = url.siteName, !siteName.isEmpty {
            return siteName
        }
        return URL(string: url.url)?.host ?? url.url
    }
    
    private var storedFaviconURL: URL? {
        if let favicon = url.favicon, let faviconUrl = URL(string: favicon) {
            return faviconUrl
        }
        return nil
    }

    private var googleFaviconURL: URL? {
        if let host = URL(string: url.url)?.host,
           let encoded = host.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            return URL(string: "https://www.google.com/s2/favicons?domain=\(encoded)&sz=32")
        }
        return nil
    }

    var body: some View {
        // Use rich social preview card for fetched social URLs
        if !isPending && !isFailed, socialUrlInfo(for: url.url) != nil {
            SocialPreviewCard(url: url)
        } else {
            Link(destination: URL(string: url.url)!) {
                HStack(spacing: 12) {
                    // Icon: spinner for pending, error for failed, favicon otherwise
                    Group {
                        if isPending {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else if isFailed {
                            Image(systemName: "exclamationmark.circle")
                                .foregroundStyle(.red)
                        } else {
                            FaviconImage(primaryURL: storedFaviconURL, fallbackURL: googleFaviconURL)
                        }
                    }
                    .frame(width: 20, height: 20)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(displayTitle)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundStyle(.primary)
                                .lineLimit(1)

                            if isPending {
                                Text("Fetching...")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            } else if isFailed {
                                Text("Failed to fetch")
                                    .font(.caption2)
                                    .foregroundStyle(.red)
                            }
                        }

                        if !isPending && !isFailed, let description = url.description, !description.isEmpty {
                            Text(description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }

                        Text(url.url)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

#Preview {
    TodoEditSheet(
        todo: {
            let item = TodoItem(title: "Buy groceries")
            item.itemNotes = "Get milk, eggs, and bread"
            item.dueDate = Date().addingTimeInterval(86400) // Tomorrow
            item.priority = "high"
            return item
        }(),
        onSave: { _, _, _, _, _ in },
        onCancel: {}
    )
    .environment(UserPreferencesService(apiService: APIService(authService: AuthService())))
}
