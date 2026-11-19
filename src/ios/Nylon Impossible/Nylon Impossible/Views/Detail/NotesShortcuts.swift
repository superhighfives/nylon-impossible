//
//  NotesShortcuts.swift
//  Nylon Impossible
//
//  ⌘B, ⌘I and ⌘E while the notes field has the cursor, with a hardware
//  keyboard (an iPhone or iPad with one attached, or the app on a Mac). They
//  edit the field's own text view through `UITextInput.replace(_:withText:)`,
//  as typing does, so ⌘Z undoes each in one step and the change reaches the
//  field's binding, which saves it. Setting the binding instead would leave
//  nothing on the undo stack.
//

#if os(iOS)
import SwiftUI
import UIKit

/// The three shortcuts, as buttons nobody sees: SwiftUI turns each into a key
/// command, which is also what an iPad lists, by title, when you hold ⌘.
struct NotesShortcuts: View {
    var body: some View {
        ZStack {
            ForEach(NotesFormat.Marker.allCases, id: \.self) { marker in
                Button(marker.title) { NotesShortcuts.toggle(marker) }
                    .keyboardShortcut(KeyEquivalent(marker.key), modifiers: .command)
            }
        }
        .frame(width: 0, height: 0)
        .opacity(0)
        .accessibilityHidden(true)
    }

    /// Wrap or unwrap the selection in the text view that has the cursor.
    @MainActor
    static func toggle(_ marker: NotesFormat.Marker) {
        guard let input = UIResponder.nylonFirstResponder as? (UIResponder & UITextInput),
              let selected = input.selectedTextRange,
              let whole = input.textRange(from: input.beginningOfDocument, to: input.endOfDocument),
              let value = input.text(in: whole)
        else { return }
        let start = input.offset(from: input.beginningOfDocument, to: selected.start)
        let end = input.offset(from: input.beginningOfDocument, to: selected.end)
        guard let edit = NotesFormat.toggle(
            marker, in: value, selection: NSRange(location: start, length: end - start)
        ) else { return }
        func position(_ offset: Int) -> UITextPosition? {
            input.position(from: input.beginningOfDocument, offset: offset)
        }
        guard let from = position(edit.range.location),
              let to = position(edit.range.location + edit.range.length),
              let range = input.textRange(from: from, to: to)
        else { return }
        input.replace(range, withText: edit.insert)
        if let from = position(edit.selection.location),
           let to = position(edit.selection.location + edit.selection.length) {
            input.selectedTextRange = input.textRange(from: from, to: to)
        }
    }
}

extension UIResponder {
    private nonisolated(unsafe) static weak var found: UIResponder?

    /// Whatever has the cursor: an action sent to no target goes to the
    /// first responder.
    @MainActor
    static var nylonFirstResponder: UIResponder? {
        found = nil
        UIApplication.shared.sendAction(#selector(nylonCaptureFirstResponder), to: nil, from: nil, for: nil)
        return found
    }

    @objc private func nylonCaptureFirstResponder() {
        UIResponder.found = self
    }
}
#endif
