//
//  TodoDetailSheet.swift
//  Nylon Impossible
//
//  The detail sheet, in the spec's order: the title in Archivo (the largest
//  text on screen, edited in place), a chip row (List, Due, Repeat, Pin),
//  Notes, Subtasks, Links, and a footer with Delete and the dates.
//
//  Every edit saves as it's made. There's no Save or Cancel: closing the sheet
//  is the only way to finish, and there's nothing left to save when you do.
//  Typing writes to the store at once and syncs once you pause.
//

import SwiftData
import SwiftUI

struct TodoDetailSheet: View {
    @Bindable var todo: TodoItem
    let actions: TodoActions
    /// Every list in display order.
    let lists: [TodoListModel]
    let apiService: APIService?
    let userId: String?
    /// Set when the detail is the iPad inspector rather than a sheet, so ×
    /// and Delete close the panel instead of dismissing a presentation.
    var onClose: (() -> Void)?

    @Environment(\.dismiss) var dismiss
    @Environment(\.modelContext) var modelContext
    @Query var everyTodo: [TodoItem]

    @State var title: String
    @State var notes: String
    @State var newSubtask = ""
    @State var showsDatePicker = false
    @State var urls: [APITodoUrl]
    @State var pendingSync: Task<Void, Never>?
    @FocusState var focus: Field?

    enum Field { case title, notes, subtask }

    init(
        todo: TodoItem,
        actions: TodoActions,
        lists: [TodoListModel],
        apiService: APIService?,
        userId: String?,
        showsCalendar: Bool = false,
        onClose: (() -> Void)? = nil
    ) {
        self.todo = todo
        self.onClose = onClose
        _showsDatePicker = State(initialValue: showsCalendar)
        self.actions = actions
        self.lists = lists
        self.apiService = apiService
        self.userId = userId
        _title = State(initialValue: todo.title)
        _notes = State(initialValue: todo.itemNotes ?? "")
        let todoId = todo.id.uuidString.lowercased()
        _urls = State(initialValue: todo.urls
            .sorted { $0.position < $1.position }
            .map { APITodoUrl(from: $0, todoId: todoId) })
    }

    var subtasks: [TodoItem] {
        everyTodo
            .filter { $0.parentId == todo.id && !$0.isSoftDeleted }
            .sorted { a, b in
                if a.isCompleted != b.isCompleted { return !a.isCompleted }
                return a.position < b.position
            }
    }

    var list: TodoListModel? {
        lists.first { $0.id.lowercased() == todo.listKey?.lowercased() }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // The sheet closes with the drag indicator or a swipe down; only
                // the iPad inspector, which has no such gesture, keeps ×.
                if onClose != nil {
                    closeRow
                } else {
                    Spacer().frame(height: Theme.Space.s6)
                }
                titleField
                chips
                if showsDatePicker { datePicker }
                Hairline().padding(.top, 22).padding(.bottom, Theme.Space.s4)
                notesField
                if todo.recurrence == nil { subtasksSection }
                if !urls.isEmpty { linksSection }
                Hairline().padding(.top, 22).padding(.bottom, Theme.Space.s1)
                footer
            }
            .padding(.horizontal, Theme.Phone.gutter)
            .padding(.bottom, Theme.Space.s12)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.Colors.canvas)
        .task { await loadUrls() }
        .onDisappear(perform: flushEdits)
    }

    func close() {
        if let onClose { onClose() } else { dismiss() }
    }

    // MARK: - Title

    var closeRow: some View {
        HStack {
            Spacer()
            Button(action: close, label: {
                Image(systemName: Theme.Icon.close)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .frame(width: 30, height: 30)
                    .background(Theme.Colors.fill, in: Circle())
                    .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                    .contentShape(Circle())
            })
            .buttonStyle(.plain)
            .padding(.trailing, -10)
            .accessibilityLabel("Close")
        }
        .padding(.top, Theme.Space.s3)
    }

    var titleField: some View {
        TextField("Title", text: $title, axis: .vertical)
            .textStyle(Theme.Fonts.Role.sheetTitle, tracking: Theme.Tracking.sheetTitle)
            .foregroundStyle(Theme.Colors.ink)
            .focused($focus, equals: .title)
            .submitLabel(.done)
            .padding(.bottom, Theme.Space.s4)
            .onChange(of: title) { _, newValue in
                // Return finishes the title rather than starting a new line.
                if newValue.contains(where: \.isNewline) {
                    title = newValue.filter { !$0.isNewline }
                    focus = nil
                    return
                }
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty, trimmed != todo.title else { return }
                todo.title = trimmed
                todo.markModified()
                scheduleSync()
            }
            .onChange(of: focus) { _, newFocus in
                // Leaving the title empty puts the last real one back.
                if newFocus != .title, title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    title = todo.title
                }
            }
            .accessibilityLabel("Title")
    }

    // MARK: - Chips

    var chips: some View {
        FlowLayout(spacing: Theme.Space.s2) {
            listChip
            dueChip
            if subtasks.isEmpty { repeatChip }
            ChipButton(
                text: todo.pinned ? "Pinned" : "Pin",
                systemImage: "pin",
                isOn: todo.pinned
            ) {
                actions.togglePin(todo)
            }
            .accessibilityLabel(todo.pinned ? "Unpin" : "Pin to top")
        }
    }

    var listChip: some View {
        Menu {
            ForEach(lists) { option in
                Button {
                    actions.move(todo, toList: option.id, announce: false)
                } label: {
                    if option.id == list?.id {
                        Label(option.name, systemImage: Theme.Icon.done)
                    } else {
                        Text(option.name)
                    }
                }
            }
        } label: {
            ChipLabel(text: list?.name ?? "List", systemImage: "list.bullet", isOn: true, opensMenu: true)
                .frame(minHeight: Theme.Space.rowMinHeight)
        }
        .accessibilityLabel("List, \(list?.name ?? "none")")
    }

    var dueChip: some View {
        let label = todo.dueDate.map { DueLabel.text(for: $0) }
        return Menu {
            DueMenuItems(hasDue: false) { setDue($0) }
            Button {
                withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) { showsDatePicker.toggle() }
            } label: {
                Label(showsDatePicker ? "Hide calendar" : "Pick a date…", systemImage: Theme.Icon.due)
            }
            if todo.dueDate != nil {
                Divider()
                Button("No date", role: .destructive) { setDue(nil) }
            }
        } label: {
            ChipLabel(
                text: label?.text ?? "Due",
                systemImage: Theme.Icon.due,
                isOn: label != nil,
                tint: label?.overdue == true ? Theme.Colors.overdue : nil,
                opensMenu: true
            )
            .frame(minHeight: Theme.Space.rowMinHeight)
        }
        .accessibilityLabel(label.map { "Due, \($0.text)" } ?? "Due, none")
    }

    var repeatChip: some View {
        Menu {
            ForEach(RecurrenceFrequency.allCases, id: \.self) { frequency in
                Button {
                    setRepeat(frequency)
                } label: {
                    if todo.recurrence?.frequency == frequency {
                        Label(RepeatLabel.text(frequency), systemImage: Theme.Icon.done)
                    } else {
                        Text(RepeatLabel.text(frequency))
                    }
                }
            }
            if todo.recurrence != nil {
                Divider()
                Button("Don’t repeat", role: .destructive) { setRepeat(nil) }
            }
        } label: {
            ChipLabel(
                text: todo.recurrence.map { RepeatLabel.text($0.frequency) } ?? "Repeat",
                systemImage: Theme.Icon.repeat,
                isOn: todo.recurrence != nil,
                opensMenu: true
            )
            .frame(minHeight: Theme.Space.rowMinHeight)
        }
        .accessibilityLabel(todo.recurrence.map { "Repeat, \(RepeatLabel.text($0.frequency))" } ?? "Repeat, off")
    }

    var datePicker: some View {
        DatePicker(
            "Due",
            selection: Binding(
                get: { todo.dueDate.map { DueDay.localDate($0) } ?? Date() },
                set: { setDue(DueDay.fromLocal($0)) }
            ),
            displayedComponents: .date
        )
        .datePickerStyle(.graphical)
        .tint(Theme.Colors.ink)
        .labelsHidden()
        .padding(.top, Theme.Space.s2)
        .transition(.opacity)
    }

    // MARK: - Notes

    var notesField: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: "Notes")
            TextField("Add notes", text: $notes, prompt: Text("Add notes").foregroundStyle(Theme.Colors.inkMuted), axis: .vertical)
                .textStyle(Theme.Fonts.Role.body)
                .foregroundStyle(Theme.Colors.ink)
                .lineLimit(3...)
                .focused($focus, equals: .notes)
                .onChange(of: notes) { _, newValue in
                    let value = newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : newValue
                    guard value != todo.itemNotes else { return }
                    todo.itemNotes = value
                    todo.markModified()
                    scheduleSync()
                }
                .accessibilityLabel("Notes")
        }
    }

}
