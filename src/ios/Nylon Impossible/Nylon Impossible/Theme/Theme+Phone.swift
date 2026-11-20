//
//  Theme+Phone.swift
//  Nylon Impossible
//
//  The phone layout's type roles, by what they set. Each is a style that
//  tokens.json names and Theme.swift generates, so the web's phone layout
//  reads the same values; this only names them for the views.
//

import SwiftUI
#if os(iOS)
import UIKit
#endif

extension Theme.Fonts {
    /// Roles on the phone layout, named for what they set.
    enum Role {
        /// The list name under the switcher ("Today"), Archivo 46 bold.
        static let masthead = Phone.display
        /// The detail sheet's title, the largest text on screen while it's open.
        static let sheetTitle = Phone.sheetTitle
        /// Collection names on the Lists page.
        static let listName = Phone.title
        /// A todo's title in a row.
        static let rowTitle = Phone.rowTitle
        /// Body copy: notes, settings rows, the composer.
        static let body = Phone.body
        /// Switcher titles and quiet buttons ("‹ Lists", "Delete").
        static let control = Phone.control
        /// The masthead's subline ("Sunday, October 18 · 4 todos").
        static let subline = Phone.subline
        /// Chip labels.
        static let chip = Phone.chip
        /// Subtask titles in the detail sheet.
        static let subtask = Phone.subtask
        /// The meta line and footers.
        static let meta = Phone.meta
        /// Section labels in the sheet and settings ("Notes", "Subtasks").
        static let label = Phone.label
    }
}

extension Theme {
    /// Tracking, as a fraction of the size (the web's `letter-spacing` in
    /// em), from the styles that carry it in tokens.json.
    enum Tracking {
        static let masthead = Fonts.Phone.display.tracking
        static let sheetTitle = Fonts.Phone.sheetTitle.tracking
        static let title = Fonts.Phone.title.tracking
        static let rowTitle = Fonts.Phone.rowTitle.tracking
    }

    /// Fixed measurements of the phone layout.
    enum Phone {
        /// Page gutter.
        static let gutter = Theme.Space.s5
        /// The checkbox's drawn size.
        static let checkbox: CGFloat = 24
        /// A subtask's smaller checkbox.
        static let subtaskCheckbox: CGFloat = 18
        /// Corner radius of the floating composer pill.
        static let composerRadius: CGFloat = 24
        /// Height of the switcher row.
        static let switcherHeight = Theme.Space.rowMinHeight
        /// Avatar circle in the switcher.
        static let avatar: CGFloat = 30
        /// How long a checked row holds before it leaves.
        static let doneHold: Duration = .milliseconds(400)
        /// How long a toast stays up.
        static let toastDuration: Duration = .seconds(5)
    }
}

extension Theme.Motion {
    /// The curve for a change that moves things — a line appearing and
    /// pushing rows down, a field growing. Nil under Reduce Motion, which
    /// keeps opacity changes and drops movement.
    static func moving(_ duration: TimeInterval = base, reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : easeOutStrong(duration)
    }
}

extension Theme.Fonts.Style {
    /// Tracking in points for this style's size.
    func tracking(_ em: CGFloat) -> CGFloat { size * em }
}

extension Theme.Fonts.Style {
    /// The face scaled for a given Dynamic Type size rather than the app's
    /// current one, so a SwiftUI `dynamicTypeSize` (a cap on the switcher, a
    /// preview, a live change in Settings) reaches it. Cached: building a
    /// variable-font descriptor in every body pass adds up over a long list.
    @MainActor
    func uiFont(for dynamicTypeSize: DynamicTypeSize) -> PlatformFont {
        let key = FontCacheKey(style: self, size: dynamicTypeSize)
        if let cached = FontCache.fonts[key] { return cached }
        #if os(macOS)
        // No Dynamic Type on the Mac: the token size is the size.
        let font = baseFont
        #else
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicTypeSize))
        let font = UIFontMetrics(forTextStyle: textStyle).scaledFont(for: baseFont, compatibleWith: traits)
        #endif
        FontCache.fonts[key] = font
        return font
    }
}

private struct FontCacheKey: Hashable {
    let size: CGFloat
    let lineHeight: CGFloat
    let weight: CGFloat
    let isDisplay: Bool
    let textStyle: String
    let dynamicTypeSize: DynamicTypeSize

    init(style: Theme.Fonts.Style, size: DynamicTypeSize) {
        self.size = style.size
        lineHeight = style.lineHeight
        weight = style.variationWeight
        isDisplay = style.isDisplay
        textStyle = style.textStyle.rawValue
        dynamicTypeSize = size
    }
}

@MainActor
private enum FontCache {
    static var fonts: [FontCacheKey: PlatformFont] = [:]
}

extension Theme.Fonts.Style {
    /// The space between lines that makes up the style's line height, at a
    /// Dynamic Type size. Text views stacked as lines (the drawn notes) are
    /// spaced by it too, so they keep the same rhythm as one text.
    @MainActor
    func lineSpacing(for dynamicTypeSize: DynamicTypeSize) -> CGFloat {
        let font = uiFont(for: dynamicTypeSize)
        return max(0, lineHeight * (font.pointSize / size) - font.nylonLineHeight)
    }
}

/// Sets a token text style at the environment's Dynamic Type size. Reading
/// the size here is what makes text re-lay out when it changes, and lets a
/// `.dynamicTypeSize(...)` cap apply to these fonts like system ones.
private struct TextStyleModifier: ViewModifier {
    let style: Theme.Fonts.Style
    let tracking: CGFloat

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    func body(content: Content) -> some View {
        let font = style.uiFont(for: dynamicTypeSize)
        let scale = font.pointSize / style.size
        return content
            .font(Font(font))
            .lineSpacing(style.lineSpacing(for: dynamicTypeSize))
            .tracking(style.tracking(tracking) * scale)
    }
}

extension View {
    /// Set a token text style: the scaled font plus the line spacing that
    /// makes up its line height.
    func textStyle(_ style: Theme.Fonts.Style, tracking em: CGFloat = 0) -> some View {
        modifier(TextStyleModifier(style: style, tracking: em))
    }
}
