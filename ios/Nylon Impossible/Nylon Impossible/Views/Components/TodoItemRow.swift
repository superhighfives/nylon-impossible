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
                            todo.isCompleted ? Color.clear : Color.tertiaryGray,
                            lineWidth: 2
                        )
                        .frame(width: 28, height: 28)
                    
                    if todo.isCompleted {
                        Circle()
                            .fill(LinearGradient.primaryGradient)
                            .frame(width: 28, height: 28)
                        
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .scaleEffect(checkmarkScale)
                    }
                }
            }
            .buttonStyle(.plain)
            
            // Task title
            Text(todo.title)
                .font(.system(size: 16))
                .foregroundStyle(todo.isCompleted ? Color.placeholderGray : .primary)
                .strikethrough(todo.isCompleted, color: Color.placeholderGray)
                .animation(.easeInOut(duration: 0.2), value: todo.isCompleted)
            
            Spacer()
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(.white)
        )
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
