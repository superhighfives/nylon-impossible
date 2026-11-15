import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("NotesMarkdown (the web's notes Markdown, #676)")
struct NotesMarkdownTests {
    typealias Block = NotesMarkdown.Block

    func plain(_ text: AttributedString) -> String { String(text.characters) }

    func paragraph(_ block: Block?) -> AttributedString? {
        if case let .paragraph(text) = block?.kind { return text }
        return nil
    }

    func list(_ block: Block?) -> NotesMarkdown.List? {
        if case let .list(list) = block?.kind { return list }
        return nil
    }

    func links(_ text: AttributedString) -> [URL] {
        text.runs.compactMap(\.link)
    }

    func isStrong(_ text: AttributedString, _ word: String) -> Bool {
        guard let range = text.range(of: word) else { return false }
        return text[range].runs.allSatisfy { $0.inlinePresentationIntent?.contains(.stronglyEmphasized) ?? false }
    }

    @Test("bullets are a list")
    func bullets() throws {
        let blocks = NotesMarkdown.blocks("- a\n- b")
        let items = try #require(list(blocks.first)).items
        #expect(blocks.count == 1)
        #expect(items.map { plain($0.text) } == ["a", "b"])
        #expect(list(blocks.first)?.ordered == false)
    }

    @Test("numbers are an ordered list from their first number, nested one level")
    func ordered() throws {
        let blocks = NotesMarkdown.blocks("3. one\n4. two\n  - inner")
        let numbered = try #require(list(blocks.first))
        #expect(numbered.ordered)
        #expect(numbered.start == 3)
        #expect(numbered.items.count == 2)
        #expect(numbered.items[1].list?.items.map { plain($0.text) } == ["inner"])
    }

    @Test("bold, italic and code")
    func emphasis() throws {
        let text = try #require(paragraph(NotesMarkdown.blocks("**bold** and *it* and `x`").first))
        #expect(plain(text) == "bold and it and x")
        #expect(isStrong(text, "bold"))
        #expect(!isStrong(text, "and"))
        let italic = try #require(text.range(of: "it"))
        #expect(text[italic].runs.first?.inlinePresentationIntent?.contains(.emphasized) == true)
        let code = try #require(text.range(of: "x"))
        #expect(text[code].runs.first?.inlinePresentationIntent?.contains(.code) == true)
    }

    @Test("a link is live, with its text")
    func link() throws {
        let text = try #require(paragraph(NotesMarkdown.blocks("[link](https://example.com)").first))
        #expect(plain(text) == "link")
        #expect(links(text) == [URL(string: "https://example.com")])
    }

    @Test("bare URLs are live, without the full stop after them")
    func bareURL() throws {
        let text = try #require(paragraph(NotesMarkdown.blocks("See https://example.com/a. Or www.example.com").first))
        #expect(plain(text) == "See https://example.com/a. Or www.example.com")
        #expect(links(text) == [URL(string: "https://example.com/a"), URL(string: "https://www.example.com")])
    }

    @Test("a heading is bold body text, and #### isn't one")
    func heading() throws {
        let blocks = NotesMarkdown.blocks("## Packing\n#### Not a heading")
        guard case let .heading(text) = blocks.first?.kind else {
            Issue.record("expected a heading, got \(blocks)")
            return
        }
        #expect(plain(text) == "Packing")
        #expect(isStrong(text, "Packing"))
        #expect(paragraph(blocks.last).map(plain) == "#### Not a heading")
    }

    @Test("single newlines are kept as line breaks, and blank lines as gaps")
    func newlines() throws {
        let blocks = NotesMarkdown.blocks("one\ntwo\n\nthree")
        #expect(blocks.count == 2)
        #expect(paragraph(blocks.first).map(plain) == "one\ntwo")
        #expect(blocks[1].gap)
        #expect(!blocks[0].gap)
    }

    @Test("a lead-in line then bullets: a paragraph and a list")
    func leadIn() throws {
        let blocks = NotesMarkdown.blocks("Before we go:\n- pack\n- book")
        #expect(paragraph(blocks.first).map(plain) == "Before we go:")
        #expect(list(blocks.last)?.items.count == 2)
    }

    @Test("javascript: and relative links aren't live, and show as typed")
    func unsafeLinks() throws {
        let text = try #require(paragraph(NotesMarkdown.blocks("[x](javascript:alert(1)) [y](/settings) <javascript:z>").first))
        #expect(links(text).isEmpty)
        #expect(plain(text) == "[x](javascript:alert(1)) [y](/settings) <javascript:z>")
    }

    @Test("raw HTML, entities and images show as typed")
    func literal() throws {
        let source = "<b>hi</b> &amp; ![cat](https://example.com/cat.png)"
        let text = try #require(paragraph(NotesMarkdown.blocks(source).first))
        #expect(plain(text) == source)
        #expect(text.runs.allSatisfy { $0.inlinePresentationIntent?.contains(.stronglyEmphasized) != true })
        #expect(links(text).isEmpty)
        #expect(text.runs.allSatisfy { $0.imageURL == nil })
    }

    @Test("- [ ] is a bullet with the literal brackets")
    func taskBox() throws {
        let items = try #require(list(NotesMarkdown.blocks("- [ ] milk\n- [x] eggs").first)).items
        #expect(items.map { plain($0.text) } == ["[ ] milk", "[x] eggs"])
    }

    @Test("fenced code keeps its text, Markdown and all")
    func fenced() {
        let blocks = NotesMarkdown.blocks("```\n**not bold**\n- nor a list\n```")
        #expect(blocks.map(\.kind) == [.code("**not bold**\n- nor a list")])
    }

    @Test("quotes hold their own blocks")
    func quote() throws {
        let blocks = NotesMarkdown.blocks("> said **this**\n> - and this")
        guard case let .quote(inner) = blocks.first?.kind else {
            Issue.record("expected a quote, got \(blocks)")
            return
        }
        #expect(paragraph(inner.first).map(plain) == "said this")
        #expect(list(inner.last)?.items.count == 1)
    }

    @Test("a backslash still escapes, and code spans keep their characters")
    func escapes() throws {
        let text = try #require(paragraph(NotesMarkdown.blocks(#"\*not\* `<b> & [a](b)`"#).first))
        #expect(plain(text) == "*not* <b> & [a](b)")
        #expect(links(text).isEmpty)
    }

    @Test("the editor stores exactly what was typed, Markdown and all")
    func storedRaw() {
        let typed = "Flights land **Thursday**.\n\n- [pass](https://example.com)\n"
        #expect(TodoDetailSheet.storedNotes(typed) == typed)
        #expect(TodoDetailSheet.storedNotes(" \n ") == nil)
    }
}
