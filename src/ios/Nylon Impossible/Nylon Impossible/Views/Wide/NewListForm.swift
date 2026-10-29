//
//  NewListForm.swift
//  Nylon Impossible
//
//  New list, in a small popover anchored to whichever button opened it (the
//  sidebar's or the toolbar's): a Name field and Add. Return or Add creates
//  the list; the board opens it in the fourth column and focuses its Add
//  field.
//

import SwiftUI

struct NewListForm: View {
    let onCreate: (String) -> Void
    /// Esc: close the popover.
    var onClose: () -> Void = {}

    @State private var name = ""
    @FocusState private var focused: Bool

    private var trimmed: String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            Text("New list")
                .textStyle(Theme.Fonts.Role.label)
                .foregroundStyle(Theme.Colors.inkMuted)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: Theme.Space.s2) {
                TextField("Name", text: $name)
                    .textStyle(Theme.Fonts.Role.bodyWide)
                    .textFieldStyle(.plain)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(add)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 36)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                            .strokeBorder(focused ? Theme.Colors.ink : Theme.Colors.hairline, lineWidth: 1)
                    )
                Button("Add", action: add)
                    .textStyle(Theme.Fonts.Role.bodyWide)
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.Colors.brandInk)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 36)
                    .background(Theme.Colors.brand, in: RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
                    .buttonStyle(.plain)
                    .disabled(trimmed.isEmpty)
                    .opacity(trimmed.isEmpty ? 0.5 : 1)
            }
        }
        .padding(14)
        .frame(width: 300)
        .background { EscapeKey(action: onClose) }
        .background(Theme.Colors.surface)
        .presentationCompactAdaptation(.popover)
        .onAppear { focused = true }
        .onKeyPress(.escape) {
            onClose()
            return .handled
        }
    }

    private func add() {
        guard !trimmed.isEmpty else { return }
        onCreate(trimmed)
    }
}
