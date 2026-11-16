//
//  NotesMarkdown.swift
//  Nylon Impossible
//
//  The Markdown that notes render, as on the web (`src/web/src/lib/markdown.ts`):
//  paragraphs, `-`/`*`/`1.` lists (nested one level), **bold**, *italic*,
//  `inline code`, fenced code, links and bare URLs, `#`–`###` headings and
//  `>` quotes. Every newline is a line break, so notes written as plain text
//  keep their look.
//
//  The blocks are found here, line by line; each one's text goes through
//  Foundation's `AttributedString(markdown:)` for the inline styles. Whatever
//  isn't in that list (raw HTML, images, tables, `- [ ]` boxes, `####`)
//  stays the text that was typed, and only `http(s):` and `mailto:` links
//  are live. The stored string is never changed.
//

import Foundation

enum NotesMarkdown {
    struct ListItem: Equatable {
        var text: AttributedString
        /// A blank line came before it, so it keeps that gap.
        var gap = false
        var list: List?
    }

    struct List: Equatable {
        var ordered: Bool
        var start: Int
        var items: [ListItem]
    }

    enum Kind: Equatable {
        case paragraph(AttributedString)
        /// Drawn as body-sized bold text, so a note never outshouts the title.
        case heading(AttributedString)
        case code(String)
        case quote([Block])
        case list(List)
    }

    struct Block: Equatable {
        var kind: Kind
        /// A blank line came before it, so it keeps that gap.
        var gap = false
    }

    /// Every live link in the blocks, in order, with the text it's drawn as.
    static func links(in blocks: [Block]) -> [(title: String, url: URL)] {
        func links(_ text: AttributedString) -> [(title: String, url: URL)] {
            text.runs.compactMap { run in
                run.link.map { (String(text[run.range].characters), $0) }
            }
        }
        func links(_ list: List) -> [(title: String, url: URL)] {
            list.items.flatMap { links($0.text) + ($0.list.map(links) ?? []) }
        }
        return blocks.flatMap { block -> [(title: String, url: URL)] in
            switch block.kind {
            case let .paragraph(text), let .heading(text): links(text)
            case .code: []
            case let .quote(inner): Self.links(in: inner)
            case let .list(list): links(list)
            }
        }
    }

    /// The last notes parsed and their blocks, so drawing them again doesn't
    /// parse them again. While they're being edited the drawn view is hidden,
    /// so it keeps the blocks it had rather than parsing every keystroke.
    final class Cache {
        private var source: String?
        private var cached: [Block] = []

        func blocks(_ source: String, frozen: Bool = false) -> [Block] {
            if source == self.source || (frozen && self.source != nil) { return cached }
            self.source = source
            cached = NotesMarkdown.blocks(source)
            return cached
        }
    }

    /// How deep quotes nest before the rest reads as text.
    static let maxQuoteDepth = 3

    /// Notes as blocks.
    static func blocks(_ source: String) -> [Block] {
        let normalized = source.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        return parseBlocks(normalized.components(separatedBy: "\n"), depth: 0)
    }

    // MARK: - Blocks

    static func isBlank(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces).isEmpty
    }

    static func expandTabs(_ line: String) -> String {
        line.replacingOccurrences(of: "\t", with: "    ")
    }

    /// A fence's marker: "```" or "~~~", or longer.
    static func fence(_ line: String) -> String? {
        guard let match = line.firstMatch(of: #/^ {0,3}(`{3,}|~{3,})/#) else { return nil }
        return String(match.1)
    }

    static func closesFence(_ line: String, marker: String) -> Bool {
        let body = line.drop { $0 == " " }
        guard line.count - body.count <= 3, let ch = marker.first else { return false }
        let run = body.prefix { $0 == ch }
        return run.count >= marker.count && body.dropFirst(run.count).allSatisfy { $0 == " " || $0 == "\t" }
    }

    static func heading(_ line: String) -> (level: Int, text: String)? {
        guard let match = line.wholeMatch(of: #/ {0,3}(#{1,3})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*/#) else { return nil }
        return (match.1.count, match.2.map(String.init) ?? "")
    }

    static func quoted(_ line: String) -> String? {
        guard let match = line.wholeMatch(of: #/ {0,3}> ?(.*)/#) else { return nil }
        return String(match.1)
    }

    /// A list item: its indent, marker and text.
    static func item(_ line: String) -> (indent: Int, marker: String, text: String)? {
        guard let match = expandTabs(line).wholeMatch(of: #/( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)/#) else { return nil }
        return (match.1.count, String(match.2), String(match.3))
    }

    static func parseBlocks(_ lines: [String], depth: Int) -> [Block] {
        var blocks: [Block] = []
        var blank = false
        var i = 0
        func push(_ kind: Kind) {
            blocks.append(Block(kind: kind, gap: blank && !blocks.isEmpty))
            blank = false
        }
        func startsBlock(_ line: String) -> Bool {
            fence(line) != nil || heading(line) != nil || item(line) != nil
                || (depth < maxQuoteDepth && quoted(line) != nil)
        }

        while i < lines.count {
            let line = lines[i]
            if isBlank(line) {
                blank = true
                i += 1
                continue
            }

            if let marker = fence(line) {
                var body: [String] = []
                i += 1
                while i < lines.count, !closesFence(lines[i], marker: marker) {
                    body.append(lines[i])
                    i += 1
                }
                i += 1 // the closing fence, or past the end when there isn't one
                push(.code(body.joined(separator: "\n")))
                continue
            }

            if let heading = heading(line) {
                push(.heading(strong(inline(heading.text))))
                i += 1
                continue
            }

            if depth < maxQuoteDepth, quoted(line) != nil {
                var inner: [String] = []
                while i < lines.count, let text = quoted(lines[i]) {
                    inner.append(text)
                    i += 1
                }
                push(.quote(parseBlocks(inner, depth: depth + 1)))
                continue
            }

            if item(line) != nil {
                let (list, next) = parseList(lines, from: i)
                push(.list(list))
                i = next
                continue
            }

            var paragraph: [String] = []
            while i < lines.count, !isBlank(lines[i]) {
                if !paragraph.isEmpty, startsBlock(lines[i]) { break }
                paragraph.append(lines[i].trimmingCharacters(in: .whitespaces))
                i += 1
            }
            push(.paragraph(inline(paragraph.joined(separator: "\n"))))
        }
        return blocks
    }

    /// One list from `lines[start]`: items indented two or more spaces past
    /// the first nest under the item before them (one level; deeper reads as
    /// that level), and an indented line that isn't an item continues the
    /// item above it on a new line. Returns the list and the index of the
    /// first line after it.
    static func parseList(_ lines: [String], from start: Int) -> (List, Int) {
        let first = item(lines[start])
        let ordered = first.map { isOrdered($0.marker) } ?? false
        let base = first?.indent ?? 0
        // Each item's lines, and its nested items' lines, joined at the end.
        var items: [(text: [String], gap: Bool, nested: [(text: [String], gap: Bool)], nestedOrdered: Bool, nestedStart: Int)] = []
        var blank = false
        var i = start

        while i < lines.count {
            let line = expandTabs(lines[i])
            if isBlank(line) {
                blank = true
                i += 1
                continue
            }
            if let entry = item(line) {
                let entryOrdered = isOrdered(entry.marker)
                if entry.indent >= base + 2, !items.isEmpty {
                    if items[items.count - 1].nested.isEmpty {
                        items[items.count - 1].nestedOrdered = entryOrdered
                        items[items.count - 1].nestedStart = entryOrdered ? number(entry.marker) : 1
                    }
                    items[items.count - 1].nested.append(([entry.text], blank))
                } else {
                    // A bullet after numbers, or numbers after bullets, starts a new list.
                    if entryOrdered != ordered { break }
                    items.append(([entry.text], blank, [], false, 1))
                }
                blank = false
                i += 1
                continue
            }
            let indent = line.prefix { $0 == " " }.count
            if indent >= base + 2, !blank, !items.isEmpty {
                let text = line.trimmingCharacters(in: .whitespaces)
                if items[items.count - 1].nested.isEmpty {
                    items[items.count - 1].text.append(text)
                } else {
                    let last = items[items.count - 1].nested.count - 1
                    items[items.count - 1].nested[last].text.append(text)
                }
                i += 1
                continue
            }
            break
        }

        // A blank line before whatever follows the list belongs to that, not
        // to the list's last item.
        while i > start, isBlank(lines[i - 1]) { i -= 1 }

        let list = List(
            ordered: ordered,
            start: ordered ? first.map { number($0.marker) } ?? 1 : 1,
            items: items.map { entry in
                ListItem(
                    text: inline(entry.text.joined(separator: "\n")),
                    gap: entry.gap,
                    list: entry.nested.isEmpty ? nil : List(
                        ordered: entry.nestedOrdered,
                        start: entry.nestedStart,
                        items: entry.nested.map { ListItem(text: inline($0.text.joined(separator: "\n")), gap: $0.gap) }
                    )
                )
            }
        )
        return (list, i)
    }

    static func isOrdered(_ marker: String) -> Bool {
        marker.first?.isNumber ?? false
    }

    static func number(_ marker: String) -> Int {
        Int(marker.dropLast()) ?? 1
    }

    static func strong(_ text: AttributedString) -> AttributedString {
        var text = text
        for run in text.runs {
            let intent = run.inlinePresentationIntent ?? []
            text[run.range].inlinePresentationIntent = intent.union(.stronglyEmphasized)
        }
        return text
    }
}
