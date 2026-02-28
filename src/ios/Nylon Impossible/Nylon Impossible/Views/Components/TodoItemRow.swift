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

    @Environment(\.colorScheme) private var colorScheme
    @State private var checkmarkScale: CGFloat = 1.0

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

            // Task title
            Text(todo.title)
                .font(.system(size: 16))
                .foregroundStyle(todo.isCompleted ? Color.kumoSubtle : Color.kumoDefault)
                .strikethrough(todo.isCompleted, color: Color.kumoSubtle)
                .animation(.easeInOut(duration: 0.2), value: todo.isCompleted)

            Spacer()
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
                onToggle: {}
            )
            TodoItemRow(
                todo: {
                    let item = TodoItem(title: "Complete project")
                    item.isCompleted = true
                    return item
                }(),
                onToggle: {}
            )
        }
        .padding()
    }
}
