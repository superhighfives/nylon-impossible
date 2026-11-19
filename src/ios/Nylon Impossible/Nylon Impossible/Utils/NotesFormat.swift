//
//  NotesFormat.swift
//  Nylon Impossible
//
//  ⌘B, ⌘I and ⌘E in the notes editor, as on the web
//  (`src/web/src/components/phone/notesFormat.ts`): wrap the selection in
//  Markdown bold, italic or inline code, or insert the pair at the caret. On
//  a selection that's already wrapped, just inside or just outside it, they
//  unwrap it. Positions are UTF-16 offsets, like the web's strings and
//  UIKit's text ranges, so both follow the same rules with the same tests.
//

import Foundation

enum NotesFormat {
    enum Marker: String, CaseIterable {
        case bold = "**"
        case italic = "*"
        case code = "`"

        /// The shortcut's letter, with ⌘.
        var key: Character {
            switch self {
            case .bold: "b"
            case .italic: "i"
            case .code: "e"
            }
        }

        /// Its name in the iPad's hold-⌘ list, as in the web's shortcuts sheet.
        var title: String {
            switch self {
            case .bold: "Bold"
            case .italic: "Italic"
            case .code: "Code"
            }
        }
    }

    /// Replace `range` with `insert`, then select `selection`.
    struct Edit: Equatable {
        var range: NSRange
        var insert: String
        var selection: NSRange
    }

    /// Whether a run of `count` marker characters carries the marker. Stars
    /// are shared: `**` is bold and `*` italic, so `***` is both, and ⌘I on
    /// `**bold**` leaves its markers alone.
    private static func carries(_ marker: Marker, _ count: Int) -> Bool {
        switch marker {
        case .bold: count >= 2
        case .italic: count % 2 == 1
        case .code: count >= 1
        }
    }

    private static func runBefore(_ text: [UInt16], _ at: Int, _ char: UInt16) -> Int {
        var n = 0
        while at - n > 0, text[at - n - 1] == char { n += 1 }
        return n
    }

    private static func runAfter(_ text: [UInt16], _ at: Int, _ char: UInt16) -> Int {
        var n = 0
        while at + n < text.count, text[at + n] == char { n += 1 }
        return n
    }

    /// The edit a shortcut makes to `value` with `selection` selected, or nil
    /// when wrapping would pass `max` UTF-16 units: like typing at the limit,
    /// it does nothing, rather than leave half a pair.
    static func toggle(
        _ marker: Marker,
        in value: String,
        selection: NSRange,
        max: Int = TodoText.notesMax
    ) -> Edit? {
        let text = Array(value.utf16)
        let start = selection.location
        let end = selection.location + selection.length
        guard start >= 0, end <= text.count else { return nil }
        let char = marker.rawValue.utf16.first!
        let size = marker.rawValue.utf16.count
        let selected = Array(text[start..<end])
        let selectedText = (value as NSString).substring(with: selection)

        // Inside the selection: `**bold**` selected whole.
        if selected.count >= size * 2 {
            let lead = min(runAfter(selected, 0, char), selected.count - size)
            let trail = min(runBefore(selected, selected.count, char), selected.count - size)
            if carries(marker, lead), carries(marker, trail) {
                let inner = (selectedText as NSString)
                    .substring(with: NSRange(location: size, length: selected.count - size * 2))
                return Edit(
                    range: selection,
                    insert: inner,
                    selection: NSRange(location: start, length: inner.utf16.count)
                )
            }
        }

        // Just outside it: `bold` selected in `**bold**`, or the caret in `**|**`.
        if carries(marker, runBefore(text, start, char)), carries(marker, runAfter(text, end, char)) {
            return Edit(
                range: NSRange(location: start - size, length: selection.length + size * 2),
                insert: selectedText,
                selection: NSRange(location: start - size, length: selection.length)
            )
        }

        if text.count + size * 2 > max { return nil }
        return Edit(
            range: selection,
            insert: marker.rawValue + selectedText + marker.rawValue,
            selection: NSRange(location: start + size, length: selection.length)
        )
    }

    /// `value` after `edit`.
    static func apply(_ edit: Edit, to value: String) -> String {
        (value as NSString).replacingCharacters(in: edit.range, with: edit.insert)
    }
}
