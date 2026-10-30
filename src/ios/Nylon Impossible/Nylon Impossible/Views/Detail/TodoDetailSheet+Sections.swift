//
//  TodoDetailSheet+Sections.swift
//  Nylon Impossible
//
//  The detail sheet's Subtasks and Links sections, and its footer.
//

import SwiftData
import SwiftUI

extension TodoDetailSheet {
    // MARK: - Subtasks

    var subtasksSection: some View {
        let items = subtasks
        let done = items.filter(\.isCompleted).count
        // In the fourth column, subtasks are the board's rows: its 24pt
        // checkbox, 15pt titles and row height, under a label, not a rule.
        let box = isColumn ? Theme.Phone.checkbox : Theme.Phone.subtaskCheckbox
        return VStack(alignment: .leading, spacing: 0) {
            if isColumn {
                Spacer().frame(height: Theme.Space.s4)
            } else {
                Hairline().padding(.top, 18).padding(.bottom, 14)
            }
            SectionLabel(text: "Subtasks", detail: items.isEmpty ? nil : "\(done)/\(items.count)")
                .padding(.bottom, Theme.Space.s1)
            ForEach(items) { subtask in
                HStack(alignment: isColumn ? .top : .center, spacing: Theme.Space.s3) {
                    Checkbox(
                        isChecked: subtask.isCompleted,
                        size: box,
                        label: subtask.isCompleted ? "Mark \(subtask.title) not done" : "Mark \(subtask.title) done"
                    ) {
                        actions.viewModel.toggleSubtask(subtask)
                        actions.edited()
                    }
                    .padding(.leading, isColumn ? -10 : -13)
                    .padding(.trailing, isColumn ? -6 : -9)
                    .padding(.vertical, isColumn ? -10 : -6)
                    Text(subtask.title)
                        .textStyle(isColumn ? Theme.Fonts.Role.bodyWide : Theme.Fonts.Role.subtask)
                        .foregroundStyle(subtask.isCompleted ? Theme.Colors.inkMuted : Theme.Colors.ink)
                        .strikethrough(subtask.isCompleted, color: Theme.Colors.inkMuted)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, isColumn ? Theme.Space.s3 : 7)
                .contentShape(Rectangle())
                .contextMenu {
                    Button(role: .destructive) {
                        deleteSubtask(subtask)
                    } label: {
                        Label("Delete", systemImage: Theme.Icon.delete)
                    }
                }
                // One element per subtask: its title, whether it's done, and
                // a double-tap that ticks it. Delete is an action rather
                // than a long-press only.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(subtask.title)
                .accessibilityValue(subtask.isCompleted ? "Done" : "Not done")
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(subtask.isCompleted ? "Marks it not done" : "Marks it done")
                .accessibilityAction {
                    actions.viewModel.toggleSubtask(subtask)
                    actions.edited()
                }
                .accessibilityAction(named: "Delete") { deleteSubtask(subtask) }
            }
            HStack(spacing: Theme.Space.s3) {
                Image(systemName: Theme.Icon.add)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(width: box)
                    .accessibilityHidden(true)
                TextField("Add subtask", text: $newSubtask, prompt: Text("Add subtask").foregroundStyle(Theme.Colors.inkMuted))
                    .textStyle(isColumn ? Theme.Fonts.Role.bodyWide : Theme.Fonts.Role.subtask)
                    .foregroundStyle(Theme.Colors.ink)
                    .focused($focus, equals: .subtask)
                    .submitLabel(.next)
                    .onSubmit(addSubtask)
                    .accessibilityLabel("New subtask")
            }
            .frame(minHeight: Theme.Space.rowMinHeight)
        }
    }

    func deleteSubtask(_ subtask: TodoItem) {
        actions.viewModel.deleteTodo(subtask, context: modelContext)
        actions.edited()
    }

    func addSubtask() {
        let text = newSubtask.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        actions.viewModel.addSubtask(
            title: text,
            parent: todo,
            context: modelContext,
            userId: userId,
            allTodos: everyTodo
        )
        actions.edited()
        newSubtask = ""
        focus = .subtask
    }

    // MARK: - Links

    /// Always shown: a card per link, then "Paste a link" (Return adds). A
    /// new card shows at once with its domain and "Fetching title…".
    var linksSection: some View {
        VStack(alignment: .leading, spacing: isColumn ? 0 : Theme.Space.s2) {
            if isColumn {
                Spacer().frame(height: Theme.Space.s4)
            } else {
                Hairline().padding(.top, 18).padding(.bottom, 6)
            }
            SectionLabel(text: "Links")
                .padding(.bottom, isColumn ? Theme.Space.s1 : 0)
            ForEach(urls) { url in
                LinkCard(
                    url: url,
                    isRow: isColumn,
                    onToggleShowPreview: { Task { await setShowPreview(url, !url.showsPreview) } },
                    onRetry: { Task { await retryLinks() } },
                    onRemove: { Task { await remove(url) } }
                )
            }
            HStack(spacing: Theme.Space.s3) {
                Image(systemName: Theme.Icon.link)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(width: Theme.Phone.checkbox)
                    .accessibilityHidden(true)
                TextField("Paste a link", text: $newLink, prompt: Text("Paste a link").foregroundStyle(Theme.Colors.inkMuted))
                    .textStyle(isColumn ? Theme.Fonts.Role.bodyWide : Theme.Fonts.Role.subtask)
                    .foregroundStyle(Theme.Colors.ink)
                    .focused($focus, equals: .link)
                    .textContentType(.URL)
                    #if os(iOS)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    #endif
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit { Task { await addLink() } }
                    .onChange(of: newLink) { linkInvalid = false }
                    .accessibilityLabel("Add a link")
            }
            .frame(minHeight: Theme.Space.rowMinHeight)
            if linkInvalid {
                Text("That doesn’t look like a link.")
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.destructive)
                    .padding(.leading, Theme.Phone.checkbox + Theme.Space.s3)
                    .accessibilityAddTraits(.isStaticText)
            }
        }
    }

    // MARK: - Footer

    /// Delete and Share, then the dates; at large text sizes the dates drop
    /// to their own line rather than shrinking past legibility.
    var footer: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Space.s2) {
                footerButtons
                Spacer(minLength: Theme.Space.s2)
                footerDates.lineLimit(1)
            }
            VStack(alignment: .leading, spacing: Theme.Space.s1) {
                HStack(spacing: Theme.Space.s2) { footerButtons }
                footerDates
            }
        }
    }

    var footerDates: some View {
        Text(DayLabel.footer(created: todo.createdAt, edited: todo.updatedAt))
            .textStyle(Theme.Fonts.Role.meta)
            .foregroundStyle(Theme.Colors.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    var footerButtons: some View {
        Button("Delete") {
            close()
            actions.delete(todo)
        }
        .textStyle(Theme.Fonts.Role.control)
        .fontWeight(.medium)
        .foregroundStyle(Theme.Colors.destructive)
        .frame(minWidth: Theme.Space.rowMinHeight, minHeight: Theme.Space.rowMinHeight)
        .contentShape(Rectangle())
        .padding(.leading, -Theme.Space.s2)
        .padding(.horizontal, Theme.Space.s2)
        .buttonStyle(.plain)
        .accessibilityLabel("Delete todo")

        ShareLink(item: shareText(for: todo, urls: urls)) {
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.Colors.inkMuted)
                .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
        }
        .accessibilityLabel("Share")
    }
}
