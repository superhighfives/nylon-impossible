//
//  AddTaskInputView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct AddTaskInputView: View {
    @Binding var text: String
    var canAdd: Bool
    var onAdd: () -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 0) {
            TextField("Add a new task...", text: $text, axis: .vertical)
                .font(.system(size: 16))
                .foregroundStyle(Color.appDefault)
                .focused($isFocused)
                .lineLimit(1...4)
                .onSubmit {
                    if canAdd {
                        onAdd()
                    }
                }
                // Dictation is enabled by default on iOS TextField; keyboardType
                // defaults to .default which allows the dictation mic key
                .padding(.leading, 24)
                .padding(.trailing, canAdd ? 60 : 24)
                .padding(.vertical, 22)

            Spacer(minLength: 0)
        }
        .glassEffect(.regular.interactive, in: .rect(cornerRadius: 16))
        .contentShape(RoundedRectangle(cornerRadius: 16))
        .onTapGesture {
            isFocused = true
        }
        .overlay(alignment: .trailing) {
            if canAdd {
                Button(action: {
                    onAdd()
                    isFocused = false
                }) {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.appBrandForeground)
                        .frame(width: 40, height: 40)
                        .background(Color.appBrand)
                        .glassEffect(.regular, in: .rect(cornerRadius: 14))
                }
                .padding(.trailing, 8)
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: canAdd)
    }
}

#Preview {
    ZStack {
        GradientBackground()
        VStack {
            AddTaskInputView(
                text: .constant(""),
                canAdd: false,
                onAdd: {}
            )
            AddTaskInputView(
                text: .constant("Buy groceries"),
                canAdd: true,
                onAdd: {}
            )
        }
        .padding()
    }
}
