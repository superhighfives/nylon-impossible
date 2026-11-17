//
//  Theme+Drag.swift
//  Nylon Impossible
//
//  The measurements of the board's drag (the lifted preview and the drop
//  line's dot), the rows' meta chips and the toast's Undo button. The
//  motion itself (tilt, lift, settle) is in the generated `Theme.Motion`.
//

import SwiftUI

extension Theme {
    /// A todo dragged across the board (iPad and Mac).
    enum Drag {
        /// The preview card's shadow: `0 14px 30px` at 16% black, as on web.
        static let shadowOpacity: Double = 0.16
        static let shadowRadius: CGFloat = 15
        static let shadowY: CGFloat = 14
        /// Room around the preview card so its shadow and tilt aren't
        /// clipped by the preview's bounds.
        static let previewMargin: CGFloat = 32
        /// The preview card's inner padding.
        static let previewPadding: CGFloat = Theme.Space.s3
        /// The preview's unticked box, drawn as the row's checkbox is.
        static let previewBoxRadius: CGFloat = Theme.Phone.checkbox * 7 / 24
        /// The preview's width when the row's own hasn't been measured.
        static let previewFallbackWidth: CGFloat = Theme.Wide.columnMinWidth
        /// The drop line, and the dot at its leading end with a `canvas`
        /// ring so it reads on any row.
        static let lineHeight: CGFloat = 2
        static let dotSize: CGFloat = 8
        static let dotRing: CGFloat = 2
        /// The landing swing reaches its overshoot this far through `base`.
        static let settlePeak: Double = 0.6
        /// How long a landing is held for its row to play, as on web
        /// (`SETTLE_TTL_MS`).
        static let landingHold: Duration = .seconds(1)
    }

    /// A chip on a row's meta line: due today (brand), and pinned, repeat
    /// and other due days (fill).
    enum Chip {
        static let height: CGFloat = 20
        static let paddingX: CGFloat = 7
    }

    /// The toast's action (Undo), a brand fill with dark ink.
    enum ToastAction {
        static let height: CGFloat = 36
        static let radius: CGFloat = 11
        static let paddingX: CGFloat = 14
    }
}

extension Theme.Fonts.Role {
    /// A meta chip's label: 12 semibold.
    static let metaChip = Theme.Fonts.Style(
        size: 12, lineHeight: 16, weight: .semibold, variationWeight: 600, isDisplay: false, textStyle: .caption1
    )
}
