import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("NotesLimit (the notes editor stops at the API's limit)")
struct NotesLimitTests {
    private let max = TodoText.notesMax

    @Test("notes that fit pass through")
    func fits() {
        #expect(NotesLimit.accept(old: "Flights", new: "Flights land", max: max) == "Flights land")
        let full = String(repeating: "a", count: max)
        #expect(NotesLimit.accept(old: String(full.dropLast()), new: full) == full)
    }

    @Test("typing at the limit leaves the notes unchanged")
    func typingAtLimit() {
        let full = String(repeating: "a", count: max)
        #expect(NotesLimit.accept(old: full, new: full + "b") == full)
        #expect(NotesLimit.accept(old: full, new: "b" + full) == full)
    }

    @Test("a paste that would go over inserts only what fits")
    func pasteASCII() {
        let old = String(repeating: "a", count: max - 3)
        #expect(NotesLimit.accept(old: old, new: old + "bcdef") == old + "bcd")
    }

    @Test("an emoji straddling the limit is left out, never split")
    func pasteEmoji() {
        let old = String(repeating: "a", count: max - 3)
        let accepted = NotesLimit.accept(old: old, new: old + "😀😀")
        #expect(accepted == old + "😀")
        #expect(accepted.utf16.count == max - 1)
    }

    @Test("a paste in the middle keeps the text after the caret")
    func pasteInMiddle() {
        let before = String(repeating: "a", count: 50_000)
        let after = String(repeating: "z", count: 49_990)
        let accepted = NotesLimit.accept(old: before + after, new: before + String(repeating: "m", count: 100) + after)
        #expect(accepted == before + String(repeating: "m", count: 10) + after)
        #expect(accepted.utf16.count == max)
    }

    @Test("the limit counts UTF-16 units, not characters")
    func countsUTF16() {
        let pasted = String(repeating: "😀", count: 60_000)
        #expect(pasted.utf16.count == 120_000)
        let accepted = NotesLimit.accept(old: "", new: pasted)
        #expect(accepted == String(repeating: "😀", count: 50_000))
        #expect(accepted.utf16.count == max)
    }

    @Test("notes already over the limit come back cut to it")
    func alreadyOver() {
        let over = String(repeating: "a", count: max + 20)
        let accepted = NotesLimit.accept(old: over, new: over + "b")
        #expect(accepted.utf16.count == max)
    }

    @Test("warns on the first edit that reaches the limit, then not until the cursor leaves")
    func warnsOncePerEdit() {
        let full = String(repeating: "a", count: max)
        var warning = NotesLimit.Warning()
        // Collected first: `#expect` can't call a mutating method.
        var warned = [warning.shouldWarn(for: "short")]
        warned.append(warning.shouldWarn(for: full))
        warned.append(warning.shouldWarn(for: full))
        warning.reset()
        warned.append(warning.shouldWarn(for: full))
        #expect(warned == [false, true, false, true])
    }

    @Test("the toast says what the web says")
    func message() {
        #expect(NotesLimit.message == "Notes can be up to 100,000 characters")
    }

    @Test("the count shows from 90,000 units, grouped as en-US")
    func count() {
        #expect(NotesLimit.count(String(repeating: "a", count: 89_999)) == nil)
        #expect(NotesLimit.count(String(repeating: "a", count: 90_000)) == "90,000 / 100,000")
        #expect(NotesLimit.count(String(repeating: "😀", count: 47_562)) == "95,124 / 100,000")
        #expect(NotesLimit.spokenCount(String(repeating: "a", count: 95_123)) == "95,123 of 100,000 characters")
    }
}
