//
//  TodoDrag.swift
//  Nylon Impossible
//
//  A dragged row carries its id as plain text. Anything that takes a todo —
//  the phone's switcher titles and the iPad's and Mac's sidebar entries —
//  reads it back with `todoDropTarget`. A board column, which also needs the
//  pointer to place the todo, uses its own delegate (BoardColumn) over the
//  same `TodoDropLoader`.
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
    nonisolated static func classify(_ text: String) -> ExternalDrop? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let id = UUID(uuidString: trimmed) { return .todo(id) }
        return .drafts(trimmed)
    }

    /// A dropped URL as input: web links only, so a file dragged from the
    /// Finder isn't added as a `file://` todo.
    nonisolated static func classify(_ url: URL) -> ExternalDrop? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        return .drafts(url.absoluteString)
    }
}

/// The todo being dragged out of a board row, so a column can show where
/// it would land while it's still in the air (its id only arrives on drop).
/// Set when a drag starts; a cancelled drag leaves it behind, so a column
/// only trusts it for drags that carry plain text and no link.
@MainActor
enum TodoDragSession {
    private(set) static var current: (id: UUID, pinned: Bool)?

    static func begin(_ todo: TodoItem) {
        current = (todo.id, todo.pinned)
    }

    static func end() {
        current = nil
    }
}

enum TodoDropLoader {
    /// The types a drop target takes: our rows (plain text), plus links
    /// when it also takes input from other apps.
    static func types(external: Bool) -> [UTType] {
        external ? [.url, .plainText] : [.plainText]
    }

    /// Load the first provider and hand back what it carries, on the main
    /// actor. False when there's nothing to load. With `external` false,
    /// text from other apps is ignored.
    static func load(
        _ providers: [NSItemProvider],
        external: Bool,
        deliver: @escaping @MainActor (ExternalDrop) -> Void
    ) -> Bool {
        guard let provider = providers.first else { return false }
        let hand: @Sendable (ExternalDrop?) -> Void = { drop in
            Task { @MainActor in
                if let drop { deliver(drop) }
            }
        }
        if external, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                hand(url.flatMap(ExternalDrop.classify))
            }
            return true
        }
        guard provider.canLoadObject(ofClass: NSString.self) else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let text = object as? String, let drop = ExternalDrop.classify(text) else { return }
            if case .drafts = drop, !external { return }
            hand(drop)
        }
        return true
    }
}

extension View {
    /// Make this view a drag source for `todo`.
    func todoDragSource(_ todo: TodoItem) -> some View {
        onDrag {
            TodoDragSession.begin(todo)
            return NSItemProvider(object: todo.id.uuidString as NSString)
        }
    }

    /// Accept a dragged todo. `perform` runs on the main actor with its id.
    /// With `onExternal`, text and web links from other apps are accepted
    /// too, and handed over as composer input.
    func todoDropTarget(
        isTargeted: Binding<Bool>? = nil,
        onExternal: (@MainActor (String) -> Void)? = nil,
        perform: @escaping @MainActor (UUID) -> Void
    ) -> some View {
        let external = onExternal != nil
        return onDrop(of: TodoDropLoader.types(external: external), isTargeted: isTargeted) { providers in
            TodoDropLoader.load(providers, external: external) { drop in
                switch drop {
                case .todo(let id):
                    TodoDragSession.end()
                    perform(id)
                case .drafts(let text): onExternal?(text)
                }
            }
        }
    }
}
