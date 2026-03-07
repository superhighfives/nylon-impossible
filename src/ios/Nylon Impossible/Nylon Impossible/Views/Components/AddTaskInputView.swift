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
            TextField("Add a new task...", text: $text)
                .font(.system(size: 16))
                .foregroundStyle(Color.appDefault)
                .focused($isFocused)
                .onSubmit {
                    if canAdd {
                        onAdd()
                    }
                }
                .padding(.leading, 20)
                .padding(.trailing, 56)
                .padding(.vertical, 18)

            Spacer()
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.appElevated)
                .stroke(Color.appLine, lineWidth: 0.5)
        )
        .overlay(alignment: .trailing) {
            Button(action: {
                onAdd()
                isFocused = false
            }) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.appBrand)
                        .frame(width: 40, height: 40)

                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .opacity(canAdd ? 1.0 : 0.4)
            .disabled(!canAdd)
            .padding(.trailing, 8)
            .animation(.easeInOut(duration: 0.2), value: canAdd)
        }
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
