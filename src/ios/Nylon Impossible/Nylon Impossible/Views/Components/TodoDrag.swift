//
//  TodoDrag.swift
//  Nylon Impossible
//
//  A dragged row carries its id as plain text. Anything that takes a todo —
//  the phone's switcher titles, the iPad's and Mac's columns, rows and
//  sidebar entries — reads it back with `todoDropTarget`.
//
//  A column also takes text and links dragged in from other apps (a Safari
//  tab, a line from Notes, a selection in Mail): `onExternal` gets the text,
//  which the board adds as todos, one per line, through the composer's path.
//  `ExternalDrop` decides which of the two a drop is.
//

import SwiftUI
import UniformTypeIdentifiers

/// What a drop carries: one of our own rows, or something from elsewhere.
enum ExternalDrop: Equatable {
    /// A row dragged within Nylon (its id as text).
    case todo(UUID)
    /// Text or a link from another app, as composer input.
    case drafts(String)

    /// Classify dropped text. A bare UUID is one of our rows; anything else
    /// with words in it is input. Nil for nothing usable.
    static func classify(_ text: String) -> ExternalDrop? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let id = UUID(uuidString: trimmed) { return .todo(id) }
        return .drafts(trimmed)
    }

    /// A dropped URL as input: web links only, so a file dragged from the
    /// Finder isn't added as a `file://` todo.
    static func classify(_ url: URL) -> ExternalDrop? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        return .drafts(url.absoluteString)
    }
}

extension View {
    /// Make this view a drag source for `todo`.
    func todoDragSource(_ todo: TodoItem) -> some View {
        onDrag { NSItemProvider(object: todo.id.uuidString as NSString) }
    }

    /// Accept a dragged todo. `perform` runs on the main actor with its id.
    /// With `onExternal`, text and web links from other apps are accepted
    /// too, and handed over as composer input.
    func todoDropTarget(
        isTargeted: Binding<Bool>? = nil,
        onExternal: (@MainActor (String) -> Void)? = nil,
        perform: @escaping @MainActor (UUID) -> Void
    ) -> some View {
        let types: [UTType] = onExternal == nil ? [.plainText] : [.url, .plainText]
        return onDrop(of: types, isTargeted: isTargeted) { providers in
            guard let provider = providers.first else { return false }
            let deliver: @Sendable (ExternalDrop?) -> Void = { drop in
                Task { @MainActor in
                    switch drop {
                    case .todo(let id): perform(id)
                    case .drafts(let text): onExternal?(text)
                    case nil: break
                    }
                }
            }
            if onExternal != nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                _ = provider.loadObject(ofClass: URL.self) { url, _ in
                    deliver(url.flatMap(ExternalDrop.classify))
                }
                return true
            }
            guard provider.canLoadObject(ofClass: NSString.self) else { return false }
            _ = provider.loadObject(ofClass: NSString.self) { object, _ in
                guard let text = object as? String, let drop = ExternalDrop.classify(text) else { return }
                if case .drafts = drop, onExternal == nil { return }
                deliver(drop)
            }
            return true
        }
    }
}
