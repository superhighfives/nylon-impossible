import Foundation
import Testing
@testable import Nylon_Impossible

/// The same cases as the web's `notesFormat.test.ts`, so ⌘B, ⌘I and ⌘E
/// behave identically on both.
@Suite("NotesFormat (⌘B, ⌘I and ⌘E in notes, #732)")
struct NotesFormatTests {
    typealias Marker = NotesFormat.Marker

    /// `text` with the selection marked by `[` and `]` (or a lone `|` for the
    /// caret), after the shortcut, in the same notation.
    func press(_ text: String, _ marker: Marker, max: Int = TodoText.notesMax) -> String? {
        let ns = text as NSString
        let caret = ns.range(of: "|").location
        let start = caret != NSNotFound ? caret : ns.range(of: "[").location
        let end = caret != NSNotFound ? caret : ns.range(of: "]").location - 1
        let value = text.replacingOccurrences(of: "[\\[\\]|]", with: "", options: .regularExpression)
        guard let edit = NotesFormat.toggle(
            marker, in: value, selection: NSRange(location: start, length: end - start), max: max
        ) else { return nil }
        let next = NotesFormat.apply(edit, to: value) as NSString
        let from = edit.selection.location
        let to = from + edit.selection.length
        let head = next.substring(to: from)
        if from == to { return head + "|" + next.substring(from: from) }
        return head + "[" + next.substring(with: NSRange(location: from, length: to - from)) + "]" + next.substring(from: to)
    }

    @Test("wraps the selection", arguments: [
        (Marker.bold, "Very [Fancy] chair", "Very **[Fancy]** chair"),
        (.italic, "Very [Fancy] chair", "Very *[Fancy]* chair"),
        (.code, "Run [ls -la] now", "Run `[ls -la]` now")
    ])
    func wraps(_ marker: Marker, _ before: String, _ after: String) {
        #expect(press(before, marker) == after)
    }

    @Test("inserts the pair at the caret, with the caret between", arguments: [
        (Marker.bold, "a|b", "a**|**b"),
        (.italic, "a|b", "a*|*b"),
        (.code, "a|b", "a`|`b"),
        (.bold, "|", "**|**")
    ])
    func inserts(_ marker: Marker, _ before: String, _ after: String) {
        #expect(press(before, marker) == after)
    }

    @Test("unwraps just outside the selection", arguments: [
        (Marker.bold, "Very **[Fancy]** chair", "Very [Fancy] chair"),
        (.italic, "Very *[Fancy]* chair", "Very [Fancy] chair"),
        (.code, "Run `[ls]` now", "Run [ls] now")
    ])
    func unwrapsOutside(_ marker: Marker, _ before: String, _ after: String) {
        #expect(press(before, marker) == after)
    }

    @Test("unwraps just inside the selection", arguments: [
        (Marker.bold, "Very [**Fancy**] chair", "Very [Fancy] chair"),
        (.italic, "Very [*Fancy*] chair", "Very [Fancy] chair"),
        (.code, "Run [`ls`] now", "Run [ls] now")
    ])
    func unwrapsInside(_ marker: Marker, _ before: String, _ after: String) {
        #expect(press(before, marker) == after)
    }

    @Test("takes an empty pair back out on a second press at the caret")
    func emptyPair() {
        #expect(press("a**|**b", .bold) == "a|b")
        #expect(press("a*|*b", .italic) == "a|b")
        #expect(press("a`|`b", .code) == "a|b")
    }

    @Test("round-trips: pressing twice gives back the text and the selection", arguments: Marker.allCases)
    func roundTrips(_ marker: Marker) throws {
        let once = try #require(press("Very [Fancy] chair", marker))
        #expect(press(once, marker) == "Very [Fancy] chair")
    }

    @Test("leaves bold's markers alone on ⌘I, and italic's on ⌘B")
    func sharedStars() {
        #expect(press("**[bold]**", .italic) == "***[bold]***")
        #expect(press("[**bold**]", .italic) == "*[**bold**]*")
        #expect(press("*[it]*", .bold) == "***[it]***")
        #expect(press("[*it*]", .bold) == "**[*it*]**")
    }

    @Test("peels one marker off bold italic")
    func boldItalic() {
        #expect(press("***[both]***", .italic) == "**[both]**")
        #expect(press("***[both]***", .bold) == "*[both]*")
    }

    @Test("doesn't take markers that only sit on one side")
    func oneSided() {
        #expect(press("**[bold]", .bold) == "****[bold]**")
        #expect(press("a**|", .bold) == "a****|**")
    }

    @Test("does nothing when wrapping would pass the limit")
    func limit() {
        #expect(press("ab[c]", .bold, max: 6) == nil)
        #expect(press("ab[c]", .italic, max: 5) == "ab*[c]*")
        #expect(press("ab[c]", .code, max: 4) == nil)
        #expect(press("a|", .bold, max: 4) == nil)
        // Unwrapping only shortens, so it still works at the limit.
        #expect(press("**[c]**", .bold, max: 5) == "[c]")
    }

    @Test("counts in UTF-16, as UIKit's ranges and the web do")
    func utf16() {
        #expect(press("🪑 [Fancy]", .bold) == "🪑 **[Fancy]**")
        #expect(press("[🪑]", .code) == "`[🪑]`")
    }

    @Test("uses the notes' own limit by default")
    func defaultLimit() {
        let full = String(repeating: "a", count: TodoText.notesMax - 1)
        #expect(NotesFormat.toggle(.bold, in: full, selection: NSRange(location: 0, length: 0)) == nil)
        #expect(NotesFormat.toggle(.code, in: full, selection: NSRange(location: 0, length: 0)) == nil)
    }

    @Test("labels the shortcuts Bold, Italic and Code, on B, I and E")
    func labels() {
        #expect(Marker.allCases.map(\.title) == ["Bold", "Italic", "Code"])
        #expect(Marker.allCases.map(\.key) == ["b", "i", "e"])
    }
}
