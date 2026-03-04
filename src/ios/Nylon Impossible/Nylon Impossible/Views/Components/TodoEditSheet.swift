//
//  TodoEditSheet.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import SwiftUI

struct TodoEditSheet: View {
    let todo: TodoItem
    var onSave: (String, String?, Date?, TodoPriority?) -> Void
    var onCancel: () -> Void
    
    @State private var title: String
    @State private var description: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var priority: TodoPriority?
    
    init(
        todo: TodoItem,
        onSave: @escaping (String, String?, Date?, TodoPriority?) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.todo = todo
        self.onSave = onSave
        self.onCancel = onCancel
        
        _title = State(initialValue: todo.title)
        _description = State(initialValue: todo.itemDescription ?? "")
        _hasDueDate = State(initialValue: todo.dueDate != nil)
        _dueDate = State(initialValue: todo.dueDate ?? Date())
        _priority = State(initialValue: todo.todoPriority)
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
