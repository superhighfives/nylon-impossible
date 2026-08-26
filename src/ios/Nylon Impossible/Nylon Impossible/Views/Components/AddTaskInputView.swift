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
    // When true (aiEnabled), the add button becomes a split button whose
    // long-press menu offers enrich / research. A plain tap always adds with no AI.
    var aiAvailable: Bool = false
    // The selected list's `promptPhrase` ("today", "this week", "sometime"),
    // folded into the placeholder so the field also says which list you're
    // adding to. nil for custom lists — see TodoListModel.promptPhrase.
    var listPhrase: String?
    var onAdd: (AICreateOption) -> Void

    @FocusState private var isFocused: Bool

    /// "What needs to be done **this week**?", or the plain question when the
    /// list has no phrase to fold in.
    private var prompt: Text {
        guard let listPhrase else { return Text("What needs to be done?") }
        return Text("What needs to be done ") + Text(listPhrase).bold() + Text("?")
    }

    var body: some View {
        HStack(spacing: 0) {
            // The title is the accessibility label; `prompt` is what shows as
            // placeholder copy, and it carries the list's name.
            TextField("What needs to be done?", text: $text, prompt: prompt, axis: .vertical)
                .font(.system(size: 16))
                .foregroundStyle(Color.appDefault)
                .focused($isFocused)
                .lineLimit(1...4)
                .onSubmit {
                    if canAdd {
                        onAdd(.plain)
                    }
                }
                // A vertical-axis TextField's Return key inserts a newline
                // instead of firing onSubmit, so submit-on-Return is driven
                // by detecting that trailing "\n" here instead. Gated on a
                // one-character delta so a paste ending in "\n" (which lands
                // as a multi-character change) doesn't auto-submit.
                .onChange(of: text) { oldValue, newValue in
                    guard newValue.hasSuffix("\n"),
                        newValue.count == oldValue.count + 1
                    else { return }
                    text = String(newValue.dropLast())
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
                text: .constant(""),
                canAdd: false,
                listPhrase: "this week",
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
