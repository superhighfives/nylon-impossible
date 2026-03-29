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
    var onSave: (String, String?, Date?, TodoPriority?) -> Void
    var onCancel: () -> Void
    
    @State private var title: String
    @State private var description: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var priority: TodoPriority?
    @State private var urls: [APITodoUrl] = []
    @State private var research: APIResearch? = nil
    @State private var isLoadingUrls: Bool = false
    @State private var isReresearching: Bool = false
    
    init(
        todo: TodoItem,
        apiService: APIService? = nil,
        initialUrls: [APITodoUrl] = [],
        onSave: @escaping (String, String?, Date?, TodoPriority?) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.todo = todo
        self.apiService = apiService
        self.onSave = onSave
        self.onCancel = onCancel

        _title = State(initialValue: todo.title)
        _description = State(initialValue: todo.itemDescription ?? "")
        _hasDueDate = State(initialValue: todo.dueDate != nil)
        _dueDate = State(initialValue: todo.dueDate ?? Date())
        _priority = State(initialValue: todo.todoPriority)
        _urls = State(initialValue: initialUrls)
        _research = State(initialValue: todo.researchStatus != nil ? APIResearch(
            id: todo.researchId ?? "",
            status: todo.researchStatus ?? "pending",
            researchType: todo.researchType ?? "general",
            summary: todo.researchSummary,
            researchedAt: todo.researchedAt,
            createdAt: todo.researchCreatedAt ?? Date()
        ) : nil)
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
                
                // Description
                Section {
                    TextField("Add a description...", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("Description")
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
                
                // Research
                if let research {
                    ResearchSection(
                        todo: researchTodoProxy(research: research),
                        researchUrls: urls.filter { $0.researchId != nil },
                        onReresearch: { await reresearch() },
                        onCancelResearch: { await cancelResearch() }
                    )
                }

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
        
        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let descriptionValue = trimmedDescription.isEmpty ? nil : trimmedDescription
        let dueDateValue = hasDueDate ? dueDate : nil
        
        onSave(trimmedTitle, descriptionValue, dueDateValue, priority)
    }
    
    /// Build a lightweight TodoItem proxy that ResearchSection can read research state from.
    private func researchTodoProxy(research: APIResearch) -> TodoItem {
        let proxy = TodoItem(title: todo.title)
        proxy.researchId = research.id
        proxy.researchStatus = research.status
        proxy.researchType = research.researchType
        proxy.researchSummary = research.summary
        proxy.researchedAt = research.researchedAt
        proxy.researchCreatedAt = research.createdAt
        return proxy
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
        // Cancellation is handled server-side; just re-sync after a brief delay
        await loadUrls()
    }

    private func loadUrls() async {
        guard let apiService = apiService else { return }

        // Fetch if there are pending URLs or pending research that may have resolved
        let hasPendingUrls = urls.contains(where: { $0.fetchStatus == .pending })
        let hasPendingResearch = research?.status == "pending"
        guard hasPendingUrls || hasPendingResearch || isReresearching else { return }

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

#Preview {
    TodoEditSheet(
        todo: {
            let item = TodoItem(title: "Buy groceries")
            item.itemDescription = "Get milk, eggs, and bread"
            item.dueDate = Date().addingTimeInterval(86400) // Tomorrow
            item.priority = "high"
            return item
        }(),
        onSave: { _, _, _, _ in },
        onCancel: {}
    )
}
