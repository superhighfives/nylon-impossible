//
//  NotesMarkdownView.swift
//  Nylon Impossible
//
//  The open todo's notes drawn as formatted text (see NotesMarkdown), at the
//  editor's type size and line height, so switching between the two moves
//  nothing but the text (principle 8). Links are ink with an inkSubtle
//  underline, never brand yellow; code sits on fill, and quotes have a
//  hairline bar and inkMuted text, as on the web.
//

import SwiftUI

struct NotesMarkdownView: View {
    let blocks: [NotesMarkdown.Block]
    let style: Theme.Fonts.Style

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Between blocks and items, the line spacing inside one text, so the
    /// lines keep the editor's line height.
    var spacing: CGFloat { style.lineSpacing(for: dynamicTypeSize) }

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
        Text(Self.styled(text))
            .textStyle(style)
            .fixedSize(horizontal: false, vertical: true)
    }

    func blockView(_ block: NotesMarkdown.Block) -> AnyView {
        switch block.kind {
        case let .paragraph(content):
            return AnyView(text(content))
        case let .heading(content):
            return AnyView(text(content).accessibilityAddTraits(.isHeader))
        case let .code(content):
            return AnyView(
                Text(content)
                    .textStyle(style)
                    .monospaced()
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Theme.Space.s2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.Colors.fill, in: RoundedRectangle(cornerRadius: Theme.Radius.chip))
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

    /// Links in ink with an inkSubtle underline, and inline code on fill.
    static func styled(_ text: AttributedString) -> AttributedString {
        var text = text
        for run in text.runs {
            if run.link != nil {
                text[run.range].foregroundColor = Theme.Colors.ink
                text[run.range].underlineStyle = Text.LineStyle(pattern: .solid, color: Theme.Colors.inkSubtle)
            }
            if run.inlinePresentationIntent?.contains(.code) ?? false {
                text[run.range].backgroundColor = Theme.Colors.fill
            }
        }
        return text
    }
}
