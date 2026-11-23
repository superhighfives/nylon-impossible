//
//  QuickAddView+Header.swift
//  Nylon Impossible
//
//  The popover's header: the Nylon mark, the title and its count, a toast
//  while one is up, and the link that opens the board on the web (⌘O).
//  The old "Open Nylon" button sat where the link is, until the board
//  window went (#690).
//

#if os(macOS)
import AppKit
import SwiftUI

extension QuickAddView {
    func header(_ items: [QuickAddHeaderItem]) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s2) {
            ForEach(items, id: \.self) { item in
                switch item {
                case .mark:
                    mark
                case .title(let title):
                    Text(title)
                        .textStyle(Theme.Fonts.Role.listName, tracking: Theme.Tracking.title)
                        .foregroundStyle(Theme.Colors.ink)
                case .count(let count):
                    Text("\(count)")
                        .textStyle(Theme.Fonts.Role.meta)
                        .fontWeight(.medium)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .accessibilityLabel(MastheadCopy.todos(count))
                case .webLink:
                    Spacer(minLength: Theme.Space.s2)
                    // In the header's empty space, so it covers nothing and
                    // moves nothing (#790). It gives way first, so a long
                    // failure is cut off, not the title.
                    ToastView(toasts: actions.toasts, compact: true)
                        .layoutPriority(-1)
                    webLink
                }
            }
        }
        .padding(.horizontal, Theme.Space.s4)
        .padding(.top, Theme.Space.s4)
        .padding(.bottom, Theme.Space.s1)
    }

    /// The Nylon mark, as tall as the title's capitals and sitting on its
    /// baseline. Decorative: the web link is the header's one control.
    private var mark: some View {
        let capHeight = Theme.Fonts.Role.listName.uiFont.capHeight
        let size = capHeight / QuickAddHeaderItem.markInk
        return Image("Logo")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .foregroundStyle(Theme.Colors.inkMuted)
            // The artwork has a margin round the mark; put its ink, not the
            // frame, on the baseline.
            .alignmentGuide(.firstTextBaseline) { $0[.bottom] - size * (1 - QuickAddHeaderItem.markInk) / 2 }
            .accessibilityHidden(QuickAddHeaderItem.mark.isDecorative)
    }

    private var webLink: some View {
        Button {
            QuickAddHandoff.openNylon(open: { openURL($0) }, dismiss: onDismiss)
        } label: {
            Image(systemName: QuickAddHeaderItem.webLinkSymbol)
                .foregroundStyle(Theme.Colors.inkMuted)
        }
        .buttonStyle(.borderless)
        .pointingHandCursor()
        .help(QuickAddHeaderItem.webLinkTitle)
        .accessibilityLabel(QuickAddHeaderItem.webLinkTitle)
        .keyboardShortcut(QuickAddHeaderItem.webLinkShortcut.key, modifiers: QuickAddHeaderItem.webLinkShortcut.modifiers)
    }
}

/// The popover's header, in order: the web link sits on the right.
enum QuickAddHeaderItem: Hashable {
    case mark
    case title(String)
    case count(Int)
    case webLink

    static let webLinkTitle = "Open Nylon on the web"
    static let webLinkSymbol = "rectangle.split.3x1"
    /// ⌘O, from the field or the list. O alone opens a row's link.
    static let webLinkShortcut = (key: KeyEquivalent("o"), modifiers: EventModifiers.command)
    /// How much of the `Logo` artwork's height the mark's ink fills.
    static let markInk: CGFloat = 680 / 1024

    /// VoiceOver skips it.
    var isDecorative: Bool { self == .mark }

    /// "Today" and its count signed in, "Nylon" signed out; the mark and the
    /// link either way.
    static func items(signedIn: Bool, count: Int = 0) -> [QuickAddHeaderItem] {
        guard signedIn else { return [.mark, .title("Nylon"), .webLink] }
        return [.mark, .title("Today")] + (count > 0 ? [.count(count)] : []) + [.webLink]
    }
}
#endif
