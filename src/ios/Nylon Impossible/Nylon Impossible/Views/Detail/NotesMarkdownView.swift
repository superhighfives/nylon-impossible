//
//  NotesMarkdownView.swift
//  Nylon Impossible
//
//  The open todo's notes drawn as formatted text (see NotesMarkdown), at the
//  editor's type size and line height, so switching between the two moves
//  nothing but the text (principle 8). Links are ink with an inkSubtle
//  underline, never brand yellow; code is monospaced at
//  `Theme.Fonts.codeScale` of the text around it, on fill, and quotes have a
//  hairline bar and inkMuted text, as on the web. Headings are the notes'
//  face in semibold, so they read apart from inline bold.
//

import SwiftUI

struct NotesMarkdownView: View {
    let blocks: [NotesMarkdown.Block]
    let style: Theme.Fonts.Style

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Between blocks and items, the line spacing inside one text, so the
    /// lines keep the editor's line height.
    var spacing: CGFloat { style.lineSpacing(for: dynamicTypeSize) }

    /// The notes' face at this Dynamic Type size.
    var bodyFont: PlatformFont { style.uiFont(for: dynamicTypeSize) }

    /// Code's face: monospaced at `codeScale` of the notes' size, so it
    /// follows Dynamic Type with them. At the same size it's wider and
    /// taller than the text around it, so it wrapped and shouted.
    var codeFont: PlatformFont {
        .monospacedSystemFont(ofSize: bodyFont.pointSize * Theme.Fonts.codeScale, weight: .regular)
    }

    /// One notes line at this Dynamic Type size: what a line of the editor
    /// takes, spacing included.
    var lineHeight: CGFloat { style.lineHeight * (bodyFont.pointSize / style.size) }

    /// The space between a code block's lines that keeps the notes' line
    /// height with the smaller face.
    var codeLineSpacing: CGFloat {
        max(0, lineHeight - codeFont.nylonLineHeight)
    }

    /// The room outside a code block, above and below: one notes line less
    /// its `s3` padding, so the padding and this make up the two fence lines
    /// the editor shows, and nothing below moves (principle 8).
    var codeBlockSpace: CGFloat { max(0, lineHeight - Theme.Space.s3) }

    /// A heading's face: the notes' own at weight 600.
    var headingFont: Font { Font(bodyFont).weight(.semibold) }

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                if block.gap { gapLine }
                blockView(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tint(Theme.Colors.ink)
    }

    /// A blank line, kept at one line's height as in the editor.
    var gapLine: some View {
        Text(" ").textStyle(style).accessibilityHidden(true)
    }

    func text(_ text: AttributedString) -> some View {
        Text(Self.styled(text, code: Font(codeFont)))
            .textStyle(style)
            .fixedSize(horizontal: false, vertical: true)
    }

    func heading(_ text: AttributedString) -> some View {
        Text(Self.styled(Self.heading(text, font: headingFont), code: Font(codeFont)))
            .textStyle(style)
            .fixedSize(horizontal: false, vertical: true)
    }

    func blockView(_ block: NotesMarkdown.Block) -> AnyView {
        switch block.kind {
        case let .paragraph(content):
            return AnyView(text(content))
        case let .heading(content):
            return AnyView(heading(content).accessibilityAddTraits(.isHeader))
        case let .code(content):
            return AnyView(
                Text(content)
                    .font(Font(codeFont))
                    .lineSpacing(codeLineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
                    // As tall as the same lines of text, so the block's lines
                    // keep the notes' rhythm and nothing below it moves.
                    .padding(.vertical, max(0, bodyFont.nylonLineHeight - codeFont.nylonLineHeight) / 2)
                    .padding(Theme.Space.s3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.Colors.fill, in: RoundedRectangle(cornerRadius: Theme.Radius.chip))
                    .padding(.vertical, codeBlockSpace)
            )
        case let .quote(inner):
            return AnyView(
                HStack(alignment: .top, spacing: Theme.Space.s3) {
                    Rectangle()
                        .fill(Theme.Colors.hairline)
                        .frame(width: 2)
                    NotesMarkdownView(blocks: inner, style: style)
                        .foregroundStyle(Theme.Colors.inkMuted)
                }
                .fixedSize(horizontal: false, vertical: true)
            )
        case let .list(list):
            return AnyView(listView(list, nested: false))
        }
    }

    func listView(_ list: NotesMarkdown.List, nested: Bool) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(Array(list.items.enumerated()), id: \.offset) { index, item in
                if item.gap { gapLine }
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(list.ordered ? "\(list.start + index)." : (nested ? "◦" : "•"))
                        .textStyle(style)
                        .frame(minWidth: Theme.Space.s5, alignment: .leading)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: spacing) {
                        text(item.text)
                        if let inner = item.list { AnyView(listView(inner, nested: true)) }
                    }
                }
            }
        }
    }

    /// A heading's runs in `font`, the notes' semibold face, bar inline
    /// bold, which keeps the notes' face and its bold.
    static func heading(_ text: AttributedString, font: Font) -> AttributedString {
        var text = text
        for run in text.runs where !(run.inlinePresentationIntent?.contains(.stronglyEmphasized) ?? false) {
            text[run.range].font = font
        }
        return text
    }

    /// Links in ink with an inkSubtle underline, and inline code in `code`
    /// on fill.
    static func styled(_ text: AttributedString, code: Font) -> AttributedString {
        var text = text
        for run in text.runs {
            if run.link != nil {
                text[run.range].foregroundColor = Theme.Colors.ink
                text[run.range].underlineStyle = Text.LineStyle(pattern: .solid, color: Theme.Colors.inkSubtle)
            }
            if run.inlinePresentationIntent?.contains(.code) ?? false {
                text[run.range].font = code
                text[run.range].backgroundColor = Theme.Colors.fill
            }
        }
        return text
    }
}
