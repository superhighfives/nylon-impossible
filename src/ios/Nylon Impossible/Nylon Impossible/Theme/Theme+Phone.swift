//
//  Theme+Phone.swift
//  Nylon Impossible
//
//  The phone layout's type roles that tokens.json doesn't name yet: the
//  prototype's 46pt masthead, the 32pt detail title, and the row, switcher and
//  chip sizes. Each is built from the generated `Theme.Fonts.Style`, so it
//  picks up bundled Archivo and Dynamic Type scaling the same way the token
//  styles do. When the quality pass promotes these into tokens.json (they're
//  kept here so Phase 3 web and iOS could land in parallel without both
//  editing the generator's output), this file shrinks to nothing.
//

import SwiftUI
import UIKit

extension Theme.Fonts {
    /// Roles on the phone layout, named for what they set.
    enum Role {
        /// The list name under the switcher ("Today"), Archivo 46 bold.
        static let masthead = Style(
            size: 46, lineHeight: 46, weight: .bold, variationWeight: 700, isDisplay: true, textStyle: .largeTitle
        )
        /// The detail sheet's title, the largest text on screen while it's open.
        static let sheetTitle = Style(
            size: 32, lineHeight: 35, weight: .bold, variationWeight: 700, isDisplay: true, textStyle: .title1
        )
        /// Collection names on the Lists page and the empty-state line.
        static let listName = Phone.title
        /// A todo's title in a row.
        static let rowTitle = Style(
            size: 17, lineHeight: 23, weight: .medium, variationWeight: 500, isDisplay: false, textStyle: .body
        )
        /// Body copy: notes, settings rows, the composer.
        static let body = Phone.body
        /// Switcher titles and quiet buttons ("‹ Lists", "Delete").
        static let control = Style(
            size: 15, lineHeight: 20, weight: .semibold, variationWeight: 600, isDisplay: false, textStyle: .subheadline
        )
        /// The masthead's subline ("Sunday, October 18 · 4 todos").
        static let subline = Style(
            size: 14, lineHeight: 19, weight: .regular, variationWeight: 400, isDisplay: false, textStyle: .subheadline
        )
        /// Chip labels.
        static let chip = Style(
            size: 14, lineHeight: 18, weight: .medium, variationWeight: 500, isDisplay: false, textStyle: .subheadline
        )
        /// Subtask titles in the detail sheet.
        static let subtask = Style(
            size: 16, lineHeight: 21, weight: .regular, variationWeight: 400, isDisplay: false, textStyle: .callout
        )
        /// The meta line and footers.
        static let meta = Phone.meta
        /// Section labels in the sheet and settings ("Notes", "Subtasks").
        static let label = Style(
            size: 13, lineHeight: 18, weight: .semibold, variationWeight: 600, isDisplay: false, textStyle: .footnote
        )
    }
}

extension Theme {
    /// Tracking for the display face, as a fraction of the size (the web's
    /// `letter-spacing` in em).
    enum Tracking {
        static let masthead: CGFloat = -0.03
        static let sheetTitle: CGFloat = -0.025
        static let title: CGFloat = -0.01
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

extension Theme.Fonts.Style {
    /// Tracking in points for this style's size.
    func tracking(_ em: CGFloat) -> CGFloat { size * em }
}

extension View {
    /// Set a token text style: the scaled font plus the line spacing that
    /// makes up its line height.
    func textStyle(_ style: Theme.Fonts.Style, tracking em: CGFloat = 0) -> some View {
        let font = style.uiFont
        return self
            .font(Font(font))
            .lineSpacing(max(0, style.lineHeight * (font.pointSize / style.size) - font.lineHeight))
            .tracking(style.tracking(em) * (font.pointSize / style.size))
    }
}
