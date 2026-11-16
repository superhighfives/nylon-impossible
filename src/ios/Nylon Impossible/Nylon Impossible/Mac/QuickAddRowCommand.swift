//
//  QuickAddRowCommand.swift
//  Nylon Impossible
//
//  The popover's rows, as logic: what each key does on the selected row,
//  editing a title in place, and handing a todo to the web.
//

#if os(macOS)
import Foundation
import SwiftUI

/// What a key does on the popover's selected row. Pinning, moving and the
/// rest of a todo happen on the web, so P and the board's other letters do
/// nothing here.
enum QuickAddRowCommand: Equatable {
    case next, previous, backToField
    /// ↵: edit the title in place.
    case edit
    /// ⇧↵: open the todo on the web.
    case openOnWeb
    /// X: mark it done.
    case done
    /// O: open its first link.
    case openLink

    init?(key: KeyEquivalent, characters: String, modifiers: EventModifiers) {
        // ⌘ and ⌃ combinations belong to the system and the Edit menu.
        guard modifiers.isDisjoint(with: [.command, .control]) else { return nil }
        switch key {
        case .downArrow: self = .next; return
        case .upArrow: self = .previous; return
        case .escape: self = .backToField; return
        case .return: self = modifiers.contains(.shift) ? .openOnWeb : .edit; return
        default: break
        }
        switch characters.lowercased() {
        case "j": self = .next
        case "k": self = .previous
        case "n": self = .backToField
        case "x": self = .done
        case "o": self = .openLink
        default: return nil
        }
    }
}

/// A title being edited in place in the popover.
struct QuickAddTitleEdit: Equatable {
    let id: UUID
    let original: String
    var text: String

    init(id: UUID, original: String) {
        self.id = id
        self.original = original
        text = original
    }

    /// What to save: the trimmed title, or nil to keep the old one. A todo
    /// can't have an empty title, and the popover has no Undo toast to bring
    /// one back, so an empty field keeps the old title.
    var titleToSave: String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == original ? nil : trimmed
    }
}

/// Handing a todo to the web board, where everything but its title is edited.
enum QuickAddHandoff {
    /// ⇧↵ on a row: `/todo/:id` in the default browser, and the popover
    /// closes.
    static func openOnWeb(_ id: UUID, base: URL = Config.webBaseURL, open: (URL) -> Void, dismiss: () -> Void) {
        open(Config.webURL(forTodo: id, base: base))
        dismiss()
    }
}
#endif
