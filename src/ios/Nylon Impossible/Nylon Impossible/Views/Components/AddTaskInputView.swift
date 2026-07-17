//
//  AddTaskInputView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

/// How a new todo should be created. AI is intentional — `.plain` is the default
/// and runs no AI; the others opt in per create.
enum AICreateOption {
    case plain
    case enrich
    case research
}

struct AddTaskInputView: View {
    @Binding var text: String
    var canAdd: Bool
    // When true (Pro + aiEnabled), the add button becomes a split button whose
    // long-press menu offers enrich / research. A plain tap always adds with no AI.
    var aiAvailable: Bool = false
    var onAdd: (AICreateOption) -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 0) {
            TextField("What needs to be done?", text: $text, axis: .vertical)
                .font(.system(size: 16))
                .foregroundStyle(Color.appDefault)
                .focused($isFocused)
                .lineLimit(1...4)
                .onSubmit {
                    if canAdd {
                        onAdd(.plain)
                    }
                }
                // Dictation is enabled by default on iOS TextField; keyboardType
                // defaults to .default which allows the dictation mic key
                .padding(.leading, 16)
                .padding(.trailing, canAdd ? 52 : 16)
                .padding(.vertical, 12)

            Spacer(minLength: 0)
        }
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5)
        )
        .contentShape(RoundedRectangle(cornerRadius: 22))
        .onTapGesture {
            isFocused = true
        }
        .overlay(alignment: .trailing) {
            if canAdd {
                addButton
                    .padding(.trailing, 6)
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: canAdd)
    }

    /// The add affordance. With AI available it's a split button: a plain tap
    /// adds with no AI (primaryAction), a long-press opens enrich / research.
    /// Otherwise it's a plain add button.
    @ViewBuilder
    private var addButton: some View {
        if aiAvailable {
            Menu {
                Button {
                    onAdd(.enrich)
                    isFocused = false
                } label: {
                    Label("Add + enrich", systemImage: "sparkles")
                }
                Button {
                    onAdd(.research)
                    isFocused = false
                } label: {
                    Label("Add + research", systemImage: "magnifyingglass")
                }
            } label: {
                addButtonLabel
            } primaryAction: {
                onAdd(.plain)
                isFocused = false
            }
            .accessibilityLabel("Add todo")
            .accessibilityHint("Long press for AI options")
        } else {
            Button {
                onAdd(.plain)
                isFocused = false
            } label: {
                addButtonLabel
            }
            .accessibilityLabel("Add todo")
        }
    }

    private var addButtonLabel: some View {
        Image(systemName: "plus")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Color.appBrandForeground)
            .frame(width: 34, height: 34)
            .background(Color.appBrand)
            .glassEffect(.regular, in: .rect(cornerRadius: 10))
    }
}

#Preview {
    ZStack {
        GradientBackground()
        VStack {
            AddTaskInputView(
                text: .constant(""),
                canAdd: false,
                onAdd: { _ in }
            )
            AddTaskInputView(
                text: .constant("Buy groceries"),
                canAdd: true,
                onAdd: { _ in }
            )
            AddTaskInputView(
                text: .constant("Plan a birthday party"),
                canAdd: true,
                aiAvailable: true,
                onAdd: { _ in }
            )
        }
        .padding()
    }
}
