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
    // The selected list's `promptPhrase` ("today", "this week", "sometime"),
    // folded into the placeholder so the field also says which list you're
    // adding to. nil for custom lists — see TodoListModel.promptPhrase.
    var listPhrase: String?
    // Set by a caller that wants the field focused without the user tapping it
    // — the Home Screen "New Task" quick action. Cleared here once focus has
    // been taken, so it reads as a one-shot request rather than a state the
    // caller has to keep in sync with the keyboard.
    var focusRequested: Binding<Bool> = .constant(false)
    var onAdd: () -> Void

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
                        onAdd()
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
                        onAdd()
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
        // Both hooks are needed: a request raised before this view exists (a
        // cold launch straight into the quick action) is only seen on appear,
        // while one raised afterwards (the app was already running) only
        // arrives as a change.
        .onAppear { takeFocusIfRequested() }
        .onChange(of: focusRequested.wrappedValue) { takeFocusIfRequested() }
    }

    private func takeFocusIfRequested() {
        guard focusRequested.wrappedValue else { return }
        focusRequested.wrappedValue = false
        // Deferred a turn rather than set inline: on a cold launch straight
        // into the quick action, this runs while the field is still being
        // installed, and focus taken then is dropped on the floor.
        Task { isFocused = true }
    }

    /// The add affordance.
    private var addButton: some View {
        Button {
            onAdd()
            isFocused = false
        } label: {
            addButtonLabel
        }
        .accessibilityLabel("Add todo")
    }

    private var addButtonLabel: some View {
        Image(systemName: "plus")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Color.appBrandForeground)
            .frame(width: 34, height: 34)
            // Circular rather than a squircle: it sits inside the field's own
            // pill, and it's the same shape as NewListButton's plus.
            .background(Color.appBrand, in: .circle)
            .glassEffect(.regular, in: .circle)
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
                text: .constant(""),
                canAdd: false,
                listPhrase: "this week",
                onAdd: {}
            )
            AddTaskInputView(
                text: .constant("Buy groceries"),
                canAdd: true,
                onAdd: {}
            )
            AddTaskInputView(
                text: .constant("Plan a birthday party"),
                canAdd: true,
                onAdd: {}
            )
        }
        .padding()
    }
}
