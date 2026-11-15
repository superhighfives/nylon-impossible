//
//  NotesMarkdown+Inline.swift
//  Nylon Impossible
//
//  The inline half of NotesMarkdown: a paragraph's, item's or heading's
//  text through Foundation's `AttributedString(markdown:)`, with what notes
//  don't draw escaped first so it shows as typed, and only safe links live.
//

import Foundation

extension NotesMarkdown {
    /// A link that may be live: `http(s):` or `mailto:`, nothing else.
    static func safeURL(_ href: String) -> URL? {
        guard let url = URL(string: href), let scheme = url.scheme?.lowercased(),
              ["http", "https", "mailto"].contains(scheme) else { return nil }
        if scheme != "mailto", url.host?.isEmpty ?? true { return nil }
        return url
    }

    /// One paragraph's, item's or heading's text, `\n` kept as line breaks.
    static func inline(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: false,
            interpretedSyntax: .inlineOnlyPreservingWhitespace,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        var literals: [String] = []
        let source = literalize(text, literals: &literals)
        var parsed = (try? AttributedString(markdown: source, options: options)) ?? AttributedString(text)
        // Belt and braces: nothing but a safe link stays live.
        for run in parsed.runs {
            if let url = run.link {
                parsed[run.range].link = safeURL(url.absoluteString).map { secureBareWWW($0, text: parsed[run.range]) }
            }
            if run.imageURL != nil { parsed[run.range].imageURL = nil }
        }
        linkBareURLs(&parsed)
        // What shows as typed isn't linked either, not even a URL inside it.
        for literal in literals {
            var from = parsed.startIndex
            while from < parsed.endIndex, let range = parsed[from...].range(of: literal) {
                parsed[range].link = nil
                from = range.upperBound
            }
        }
        return parsed
    }

    /// Foundation links a bare "www." as `http:`; the web makes it `https:`.
    static func secureBareWWW(_ url: URL, text: AttributedSubstring) -> URL {
        let shown = String(text.characters)
        guard shown.lowercased().hasPrefix("www."), url.absoluteString == "http://" + shown else { return url }
        return URL(string: "https://" + shown) ?? url
    }

    /// The text with everything Foundation would read that notes don't
    /// draw escaped, so it shows as typed: raw HTML and entities, images,
    /// and links that aren't `http(s):` or `mailto:`. Code spans are copied
    /// as they are, since escapes don't work inside them. What's escaped is
    /// added to `literals`, as it will show.
    static func literalize(_ text: String, literals: inout [String]) -> String {
        let s = Array(text)
        var out = ""
        var i = 0
        while i < s.count {
            let ch = s[i]
            if ch == "\\", i + 1 < s.count {
                out.append(ch)
                out.append(s[i + 1])
                i += 2
                continue
            }
            if ch == "`" {
                var run = 0
                while i + run < s.count, s[i + run] == "`" { run += 1 }
                if let end = codeSpanEnd(s, from: i + run, run: run) {
                    out.append(String(s[i..<end]))
                    i = end
                } else {
                    out.append(String(repeating: "`", count: run))
                    i += run
                }
                continue
            }
            if ch == "!", i + 1 < s.count, s[i + 1] == "[", let end = linkEnd(s, at: i + 1)?.end {
                out.append(escaped(s[i..<end]))
                literals.append(String(s[i..<end]))
                i = end
                continue
            }
            if ch == "[", let link = linkEnd(s, at: i) {
                if safeURL(link.href) == nil {
                    out.append(escaped(s[i..<link.end]))
                    literals.append(String(s[i..<link.end]))
                } else {
                    // The link's own text gets the same treatment.
                    out.append("[" + literalize(String(s[(i + 1)..<link.textEnd]), literals: &literals))
                    out.append(String(s[link.textEnd..<link.end]))
                }
                i = link.end
                continue
            }
            if ch == "<" {
                let rest = String(s[i...])
                if let auto = rest.prefixMatch(of: #/<((?i:https?:\/\/|mailto:)[^\s<>]+)>/#), safeURL(String(auto.1)) != nil {
                    out.append(String(auto.0))
                    i += auto.0.count
                    continue
                }
                out.append("\\<")
                i += 1
                continue
            }
            if ch == "&" {
                out.append("\\&")
                i += 1
                continue
            }
            out.append(ch)
            i += 1
        }
        return out
    }

    /// Every ASCII punctuation character backslash-escaped.
    static func escaped(_ chars: ArraySlice<Character>) -> String {
        var out = ""
        for ch in chars {
            if ch.isASCII, ch.isPunctuation || ch.isSymbol { out.append("\\") }
            out.append(ch)
        }
        return out
    }

    /// Where a code span opened by a run of `run` backticks ends (just past
    /// its closing run), or nil when it isn't closed.
    static func codeSpanEnd(_ s: [Character], from start: Int, run: Int) -> Int? {
        var j = start
        while j < s.count {
            if s[j] == "`" {
                var close = 0
                while j + close < s.count, s[j + close] == "`" { close += 1 }
                if close == run { return j + close }
                j += close
            } else {
                j += 1
            }
        }
        return nil
    }

    /// `[text](href)` at `start` (on the `[`): where its text ends (on the
    /// `]`), its href and where it ends, or nil when it isn't one.
    static func linkEnd(_ s: [Character], at start: Int) -> (textEnd: Int, href: String, end: Int)? {
        var depth = 0
        var close = -1
        var j = start
        while j < s.count {
            let ch = s[j]
            if ch == "\\" {
                j += 1
            } else if ch == "[" {
                depth += 1
            } else if ch == "]" {
                depth -= 1
                if depth == 0 {
                    close = j
                    break
                }
            }
            j += 1
        }
        guard close >= 0, close + 1 < s.count, s[close + 1] == "(" else { return nil }
        j = close + 2
        while j < s.count, s[j] == " " { j += 1 }
        var href = ""
        if j < s.count, s[j] == "<" {
            guard let end = s[j...].firstIndex(of: ">") else { return nil }
            href = String(s[(j + 1)..<end])
            j = end + 1
        } else {
            var parens = 0
            let from = j
            while j < s.count {
                let ch = s[j]
                if ch.isWhitespace { break }
                if ch == "(" { parens += 1 }
                if ch == ")" {
                    if parens == 0 { break }
                    parens -= 1
                }
                j += 1
            }
            href = String(s[from..<j])
        }
        // An optional "title", which notes don't show.
        if let title = String(s[j...]).prefixMatch(of: #/\s+(?:"[^"]*"|'[^']*')/#) { j += title.0.count }
        while j < s.count, s[j] == " " { j += 1 }
        guard j < s.count, s[j] == ")" else { return nil }
        return (close, href, j + 1)
    }

    /// Bare `http(s)://` and `www.` URLs in plain text (not code, not
    /// already a link) become links, less the punctuation that closes their
    /// sentence.
    static func linkBareURLs(_ text: inout AttributedString) {
        let plain = String(text.characters)
        guard plain.localizedCaseInsensitiveContains("http") || plain.localizedCaseInsensitiveContains("www.") else { return }
        for match in plain.matches(of: #/(?i:https?:\/\/|www\.)[^\s<>]+/#) {
            // Only at the start of a word: not the "www." in "awww.".
            if match.range.lowerBound > plain.startIndex,
               plain[plain.index(before: match.range.lowerBound)].isLetter || plain[plain.index(before: match.range.lowerBound)].isNumber {
                continue
            }
            let url = trimURL(String(match.0))
            guard url.count > 4 else { continue }
            let href = url.lowercased().hasPrefix("www.") ? "https://\(url)" : url
            guard let link = safeURL(href) else { continue }
            let lower = match.range.lowerBound
            let upper = plain.index(lower, offsetBy: url.count)
            guard let range = Range(NSRange(lower..<upper, in: plain), in: text) else { continue }
            let free = text[range].runs.allSatisfy { run in
                run.link == nil && !(run.inlinePresentationIntent?.contains(.code) ?? false)
            }
            if free { text[range].link = link }
        }
    }

    /// A bare URL's end, less the punctuation that closes its sentence.
    static func trimURL(_ url: String) -> String {
        var url = Substring(url)
        while let ch = url.last {
            if ".,:;!?'\"*_~".contains(ch) {
                url = url.dropLast()
            } else if ch == ")" {
                let opens = url.filter { $0 == "(" }.count
                let closes = url.filter { $0 == ")" }.count
                if closes <= opens { break }
                url = url.dropLast()
            } else {
                break
            }
        }
        return String(url)
    }
}
