//
//  NotesLimit.swift
//  Nylon Impossible
//
//  The notes editor's limit, as on the web (`src/web/src/components/phone/
//  Notes.tsx`): it stops at `TodoText.notesMax` UTF-16 units, the units
//  `/sync`'s Zod `.max` and the web's `maxLength` count, says so once per
//  edit, and from 90% shows a count on the Notes label's line. SwiftUI's
//  `TextField` has no limit of its own, so the field's `onChange` puts every
//  value through `accept` before it saves.
//

import Foundation

enum NotesLimit {
    /// The toast when an edit reaches the limit, the web's words.
    static let message = "Notes can be up to \(grouped(TodoText.notesMax)) characters"

    /// Notes this long or longer show their count while you edit them.
    static let countFrom = TodoText.notesMax * 9 / 10

    /// What the field keeps when `old` became `new`: `new` while it fits.
    /// Past the limit, the text before and after the edit stays as it was
    /// and only as much of the new text as fits goes in, cut at a character
    /// boundary, as the web's `maxLength` does with a paste. Typing at the
    /// limit leaves `old`.
    static func accept(old: String, new: String, max: Int = TodoText.notesMax) -> String {
        guard new.utf16.count > max else { return new }

        // The edit is what's between the text both share at the start and
        // the text both share at the end.
        var oldStart = old.startIndex
        var newStart = new.startIndex
        while oldStart < old.endIndex, newStart < new.endIndex,
              same(old[oldStart], new[newStart]) {
            old.formIndex(after: &oldStart)
            new.formIndex(after: &newStart)
        }
        var oldEnd = old.endIndex
        var newEnd = new.endIndex
        while oldEnd > oldStart, newEnd > newStart {
            let oldBefore = old.index(before: oldEnd)
            let newBefore = new.index(before: newEnd)
            guard same(old[oldBefore], new[newBefore]) else { break }
            oldEnd = oldBefore
            newEnd = newBefore
        }

        let head = String(new[..<newStart])
        let tail = String(new[newEnd...])
        let room = max - head.utf16.count - tail.utf16.count
        // Notes already over the limit before the edit: keep what fits.
        guard room >= 0 else { return TodoText.capNotes(head + tail, max: max) }
        return head + TodoText.capNotes(String(new[newStart..<newEnd]), max: room) + tail
    }

    /// "95,123 / 100,000" from `countFrom` on, nil below it.
    static func count(_ notes: String) -> String? {
        let length = notes.utf16.count
        guard length >= countFrom else { return nil }
        return "\(grouped(length)) / \(grouped(TodoText.notesMax))"
    }

    /// The count as VoiceOver reads it with the field.
    static func spokenCount(_ notes: String) -> String? {
        let length = notes.utf16.count
        guard length >= countFrom else { return nil }
        return "\(grouped(length)) of \(grouped(TodoText.notesMax)) characters"
    }

    /// Whether the limit has been toasted during this edit. It warns on the
    /// first change that reaches the limit, then not again until `reset`,
    /// when the cursor leaves the notes.
    struct Warning: Equatable {
        private(set) var warned = false

        /// Whether `notes` should toast `message`.
        mutating func shouldWarn(for notes: String, max: Int = TodoText.notesMax) -> Bool {
            guard !warned, notes.utf16.count >= max else { return false }
            warned = true
            return true
        }

        mutating func reset() {
            warned = false
        }
    }

    /// Characters compared by their scalars: `==` on `Character` treats
    /// "é" and "e\u{301}" as one, though they differ in length.
    private static func same(_ a: Character, _ b: Character) -> Bool {
        a.unicodeScalars.elementsEqual(b.unicodeScalars)
    }

    /// En-US grouping, as the web's `toLocaleString("en-US")`.
    private static func grouped(_ number: Int) -> String {
        number.formatted(.number.grouping(.automatic).locale(Locale(identifier: "en_US")))
    }
}
