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
    // Every list the user can move this todo into, in the fixed
    // Today/This Week/Sometime-then-custom order. Empty until lists have
    // synced at least once.
    let availableLists: [TodoListModel]
    var onSave: (String, String?, Date?, Recurrence?, Bool) -> Void
    var onCancel: () -> Void
    var onAddSubtask: (String) -> Void
    var onToggleSubtask: (TodoItem) -> Void
    var onDeleteSubtask: (TodoItem) -> Void
    var onMoveSubtask: (IndexSet, Int) -> Void
    // Manual cross-list move. Fires immediately on picker change — there's no
    // drag-and-drop grid on iOS, so this is the only way to move a todo.
    // Subtasks never get this (implicitly scoped to their parent's list).
    var onMoveToList: (String) -> Void

    @Environment(UserPreferencesService.self) private var preferencesService
    @State private var title: String
    @State private var notes: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var recurrenceFrequency: RecurrenceFrequency?
    @State private var sticky: Bool
    @State private var selectedListId: String?
    @State private var urls: [APITodoUrl] = []
    @State private var research: APIResearch?
    @State private var isLoadingUrls: Bool = false
    @State private var isReresearching: Bool = false
    @State private var isEnriching: Bool = false
    @State private var isProcessing: Bool = false
    @State private var processMessage: String?

    init(
        todo: TodoItem,
        apiService: APIService? = nil,
        initialUrls: [APITodoUrl] = [],
        subtasks: [TodoItem] = [],
        availableLists: [TodoListModel] = [],
        onSave: @escaping (String, String?, Date?, Recurrence?, Bool) -> Void,
        onCancel: @escaping () -> Void,
        onAddSubtask: @escaping (String) -> Void = { _ in },
        onToggleSubtask: @escaping (TodoItem) -> Void = { _ in },
        onDeleteSubtask: @escaping (TodoItem) -> Void = { _ in },
        onMoveSubtask: @escaping (IndexSet, Int) -> Void = { _, _ in },
        onMoveToList: @escaping (String) -> Void = { _ in }
    ) {
        self.todo = todo
        self.apiService = apiService
        self.subtasks = subtasks
        self.availableLists = availableLists
        self.onSave = onSave
        self.onCancel = onCancel
        self.onAddSubtask = onAddSubtask
        self.onToggleSubtask = onToggleSubtask
        self.onDeleteSubtask = onDeleteSubtask
        self.onMoveSubtask = onMoveSubtask
        self.onMoveToList = onMoveToList

        _title = State(initialValue: todo.title)
        _notes = State(initialValue: todo.itemNotes ?? "")
        _hasDueDate = State(initialValue: todo.dueDate != nil)
        _dueDate = State(initialValue: todo.dueDate ?? Date())
        _recurrenceFrequency = State(initialValue: todo.recurrence?.frequency)
        _sticky = State(initialValue: todo.sticky)
        _selectedListId = State(initialValue: todo.listKey?.lowercased())
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
                    Text("Notes")
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
                
                // Sticky — pins the todo above non-sticky ones. Instantly
                // reversible, no confirm needed.
                Section {
                    Toggle("Sticky", isOn: $sticky)
                } footer: {
                    Text("Pinned todos always show above non-pinned ones.")
                }

                // List — the only way to move a todo cross-list on iOS (no
                // drag-and-drop grid). Subtasks are implicitly scoped to
                // their parent's list, so this only shows for top-level
                // todos, and only once lists have synced at least once
                // (`availableLists` is empty until then).
                if todo.parentId == nil && !availableLists.isEmpty {
                    ListPickerSection(
                        availableLists: availableLists,
                        selectedListId: $selectedListId,
                        onMoveToList: onMoveToList
                    )
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
                if recurrenceFrequency == nil {
                    SubtasksSection(
                        subtasks: subtasks,
                        onToggle: onToggleSubtask,
                        onDelete: onDeleteSubtask,
                        onMove: onMoveSubtask,
                        // Recurrence and subtasks are mutually exclusive, so
                        // adding one clears the rule — same invariant the API
                        // enforces on the write.
                        onAdd: { title in
                            recurrenceFrequency = nil
                            onAddSubtask(title)
                        }
                    )
                }

                // Link processing — deterministic, no model involved, so it
                // sits in its own section above the AI one and shows up whether
                // or not AI is on. Which button spends a model call should
                // never be ambiguous.
                TaskActionsSection(
                    isProcessing: isProcessing || hasPendingLinks,
                    message: processMessage,
                    onProcess: { Task { await processLinks() } }
                )

                // AI actions — explicit, opt-in enrich / research (nothing runs
                // automatically). Gated on the aiEnabled master switch.
                if preferencesService.aiEnabled {
                    AIActionsSection(
                        isEnriching: isEnriching,
                        isReresearching: isReresearching,
                        onEnrich: { Task { await enrichTodo() } },
                        onResearch: { Task { await reresearch() } }
                    )
                }

                // Suggestions — proposed AI enrichment changes awaiting consent
                SuggestionsSection(todo: todo, apiService: apiService)

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
                LinksSection(
                    regularUrls: urls.filter { $0.researchId == nil },
                    isLoading: isLoadingUrls && urls.isEmpty,
                    failedCount: failedLinkCount,
                    isRetrying: isProcessing || hasPendingLinks,
                    onRetry: { Task { await processLinks() } }
                )
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
    
    private func saveChanges() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let notesValue = trimmedNotes.isEmpty ? nil : trimmedNotes
        let dueDateValue = hasDueDate ? dueDate : nil
        let recurrenceValue: Recurrence? = (hasDueDate && subtasks.isEmpty)
            ? recurrenceFrequency.map { Recurrence(frequency: $0) }
            : nil

        onSave(trimmedTitle, notesValue, dueDateValue, recurrenceValue, sticky)
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

    private func enrichTodo() async {
        guard let apiService else { return }
        isEnriching = true
        defer { isEnriching = false }
        do {
            try await apiService.enrich(todoId: todo.id.uuidString.lowercased())
            // Enrichment runs in the background server-side; the enriched fields
            // arrive via the next sync. Reload detail to pick up any research.
            await loadUrls()
        } catch {
            print("[AI] Enrich error: \(error)")
        }
    }

    /// The todo's own links — research sources belong to the research section.
    private var regularLinks: [APITodoUrl] {
        urls.filter { $0.researchId == nil }
    }

    private var hasPendingLinks: Bool {
        regularLinks.contains { $0.fetchStatus == .pending }
    }

    private var failedLinkCount: Int {
        regularLinks.filter { $0.fetchStatus == .failed }.count
    }

    /// Re-run link processing: attach any URLs in the todo's text, fetch what's
    /// behind them, and replace a "Check {domain}" placeholder title with what
    /// turned up. Not an AI action — no model runs — and it doubles as the retry
    /// for a link whose fetch failed.
    private func processLinks() async {
        guard let apiService else { return }
        isProcessing = true
        processMessage = nil
        defer { isProcessing = false }
        do {
            let links = try await apiService.processTodo(todoId: todo.id.uuidString.lowercased())
            // Say so rather than leaving the button looking inert when there was
            // nothing to work with.
            guard links > 0 else {
                processMessage = "No links to process."
                return
            }
            // The links come back `pending`, so this first reload is what puts
            // the spinner on them.
            await loadUrls()
            // Fetching itself runs in the background server-side. Come back once
            // for the result so the sheet settles on its own; anything slower
            // than that lands via the next sync.
            try? await Task.sleep(for: .seconds(3))
            await loadUrls()
        } catch {
            print("[Process] Link processing error: \(error)")
            processMessage = "Couldn't process links."
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
        guard needsInitialLoad || hasPendingUrls || hasPendingResearch
            || isReresearching || isProcessing else { return }

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
    
    /// Pending URLs untouched for this long are treated as failed (worker likely restarted)
    private static let stalePendingThreshold: TimeInterval = 30

    /// Check if a pending URL is stale (fetch likely lost due to worker restart).
    /// Measured from `updatedAt`, not `createdAt`: re-processing an old link
    /// flips it back to pending, and that fresh spinner shouldn't read as stale
    /// just because the row was created weeks ago.
    private var isStale: Bool {
        url.fetchStatus == .pending &&
        Date().timeIntervalSince(url.updatedAt) > Self.stalePendingThreshold
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
        // Attached email links (e.g. a Gmail thread) render as the subject
        if emailUrlInfo(for: url.url) != nil {
            EmailRow(url: url)
        } else if !isPending && !isFailed, socialUrlInfo(for: url.url) != nil {
            // Use rich social preview card for fetched social URLs
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
            return item
        }(),
        onSave: { _, _, _, _, _ in },
        onCancel: {}
    )
    .environment(UserPreferencesService(apiService: APIService(authService: AuthService())))
}

/// A todo's subtasks: reorderable active ones, completed pinned below, and an
/// inline add field.
private struct SubtasksSection: View {
    let subtasks: [TodoItem]
    let onToggle: (TodoItem) -> Void
    let onDelete: (TodoItem) -> Void
    let onMove: (IndexSet, Int) -> Void
    let onAdd: (String) -> Void

    @State private var newSubtaskTitle: String = ""

    // Active subtasks order by position; completed sink to the bottom.
    private var activeSubtasks: [TodoItem] {
        subtasks.filter { !$0.isCompleted }.sorted { $0.position < $1.position }
    }

    private var completedSubtasks: [TodoItem] {
        subtasks.filter { $0.isCompleted }.sorted { $0.position < $1.position }
    }

    var body: some View {
        Section {
            ForEach(activeSubtasks) { subtask in
                subtaskRow(subtask)
            }
            .onMove(perform: onMove)
            .onDelete { offsets in
                for index in offsets { onDelete(activeSubtasks[index]) }
            }

            // Completed subtasks pinned to the bottom, not reorderable.
            ForEach(completedSubtasks) { subtask in
                subtaskRow(subtask)
                    .moveDisabled(true)
            }
            .onDelete { offsets in
                for index in offsets { onDelete(completedSubtasks[index]) }
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
            onToggle(subtask)
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
        onAdd(trimmed)
        newSubtaskTitle = ""
    }
}

/// Deterministic, always-available actions for a todo. Right now that's link
/// processing: attach the URLs in the task's text, fetch what's behind them,
/// and name the task after what turned up.
///
/// Deliberately its own section, sitting above the AI one and appearing whether
/// or not AI is switched on — no model runs here, and it shouldn't have to be
/// guessed at which of these buttons does.
private struct TaskActionsSection: View {
    let isProcessing: Bool
    let message: String?
    let onProcess: () -> Void

    var body: some View {
        Section {
            Button(action: onProcess) {
                HStack {
                    Label("Process links", systemImage: "arrow.clockwise")
                    if isProcessing {
                        Spacer()
                        ProgressView().scaleEffect(0.7)
                    }
                }
            }
            .disabled(isProcessing)
        } header: {
            Text("Task")
        } footer: {
            Text(message ?? "Fetches each link and titles the task after it. No AI involved.")
        }
    }
}

/// Explicit, opt-in AI actions for a todo — enrich and research. AI never runs
/// automatically; this is the deliberate per-todo affordance (Pro + aiEnabled,
/// gated by the caller).
private struct AIActionsSection: View {
    let isEnriching: Bool
    let isReresearching: Bool
    let onEnrich: () -> Void
    let onResearch: () -> Void

    var body: some View {
        Section {
            Button(action: onEnrich) {
                Label("Enrich", systemImage: "sparkles")
            }
            .disabled(isEnriching)
            Button(action: onResearch) {
                Label("Research", systemImage: "magnifyingglass")
            }
            .disabled(isReresearching)
        } header: {
            Text("AI")
        }
    }
}

/// Non-research URL links attached to a todo, or a loading state before the
/// first fetch resolves.
private struct LinksSection: View {
    let regularUrls: [APITodoUrl]
    let isLoading: Bool
    /// How many links couldn't be reached — the recoverable case (rate limits,
    /// timeouts, a site briefly down) that's worth naming and offering a retry
    /// for, rather than leaving the row looking merely empty.
    var failedCount: Int = 0
    var isRetrying: Bool = false
    var onRetry: () -> Void = {}

    var body: some View {
        if isLoading {
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
                if failedCount > 0 {
                    Button(action: onRetry) {
                        Label("Try again", systemImage: "arrow.clockwise")
                    }
                    .disabled(isRetrying)
                }
            } header: {
                Text("Links (\(regularUrls.count))")
            } footer: {
                if failedCount > 0 {
                    Text(failedCount == 1
                         ? "Couldn't reach this link."
                         : "Couldn't reach \(failedCount) links.")
                        .foregroundStyle(Color.appDanger)
                }
            }
        }
    }
}

/// List picker for moving a top-level todo between lists. Fires immediately
/// on change rather than waiting for Save, mirroring the sticky/checkbox
/// toggles' instant-effect feel.
private struct ListPickerSection: View {
    let availableLists: [TodoListModel]
    @Binding var selectedListId: String?
    let onMoveToList: (String) -> Void

    var body: some View {
        Section {
            Picker("List", selection: $selectedListId) {
                ForEach(availableLists) { list in
                    Text(list.name).tag(Optional(list.id))
                }
            }
            .pickerStyle(.menu)
            .onChange(of: selectedListId) { _, newValue in
                guard let newValue else { return }
                onMoveToList(newValue)
            }
        } header: {
            Text("List")
        }
    }
}
