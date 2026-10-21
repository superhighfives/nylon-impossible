//
//  TodoDrag.swift
//  Nylon Impossible
//
//  A dragged row carries its id as plain text. Anything that takes a todo —
//  the phone's switcher titles, the iPad's columns, rows and sidebar entries —
//  reads it back with `todoDropTarget`.
//

import SwiftUI
import UniformTypeIdentifiers

extension View {
    /// Make this view a drag source for `todo`.
    func todoDragSource(_ todo: TodoItem) -> some View {
        onDrag { NSItemProvider(object: todo.id.uuidString as NSString) }
    }

    /// Accept a dragged todo. `perform` runs on the main actor with its id.
    func todoDropTarget(isTargeted: Binding<Bool>? = nil, perform: @escaping @MainActor (UUID) -> Void) -> some View {
        onDrop(of: [UTType.plainText], isTargeted: isTargeted) { providers in
            guard let provider = providers.first else { return false }
            _ = provider.loadObject(ofClass: NSString.self) { object, _ in
                guard let text = object as? String, let id = UUID(uuidString: text) else { return }
                Task { @MainActor in perform(id) }
            }
            return true
        }
    }
}
