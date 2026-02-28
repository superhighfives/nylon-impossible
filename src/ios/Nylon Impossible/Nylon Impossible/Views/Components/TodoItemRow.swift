//
//  TodoItemRow.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct TodoItemRow: View {
    let todo: TodoItem
    var onToggle: () -> Void
    var onEdit: (String) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var checkmarkScale: CGFloat = 1.0
    @State private var isEditing = false
    @State private var editText = ""

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
                            todo.isCompleted ? Color.clear : Color.kumoLine,
                            lineWidth: 2.5
                        )
                        .frame(width: 32, height: 32)

                    if todo.isCompleted {
                        Circle()
                            .fill(Color.kumoBrand)
                            .frame(width: 32, height: 32)

                        Image(systemName: "checkmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .scaleEffect(checkmarkScale)
                    }
                }
            }
            .buttonStyle(.plain)

            // Task title — tappable to edit
            Button(action: {
                editText = todo.title
                isEditing = true
            }) {
                Text(todo.title)
                    .font(.system(size: 16))
                    .foregroundStyle(todo.isCompleted ? Color.kumoSubtle : Color.kumoDefault)
                    .strikethrough(todo.isCompleted, color: Color.kumoSubtle)
                    .animation(.easeInOut(duration: 0.2), value: todo.isCompleted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.kumoElevated)
        )
        .shadow(
            color: colorScheme == .dark ? Color.clear : Color.black.opacity(0.08),
            radius: 4,
            y: 2
        )
        .opacity(todo.isCompleted ? 0.7 : 1.0)
        .contentShape(Rectangle())
        .alert("Edit Task", isPresented: $isEditing) {
            TextField("Task title", text: $editText)
            Button("Save") {
                let trimmed = editText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    onEdit(trimmed)
                }
            }
            Button("Cancel", role: .cancel) {}
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
                    return item
                }(),
                onToggle: {},
                onEdit: { _ in }
            )
            TodoItemRow(
                todo: {
                    let item = TodoItem(title: "Complete project")
                    item.isCompleted = true
                    return item
                }(),
                onToggle: {},
                onEdit: { _ in }
            )
        }
        .padding()
    }
}
