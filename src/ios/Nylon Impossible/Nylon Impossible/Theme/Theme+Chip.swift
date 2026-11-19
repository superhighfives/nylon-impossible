//
//  Theme+Chip.swift
//  Nylon Impossible
//
//  The measurements of the rows' meta chips and the toast's Undo button.
//

import SwiftUI

extension Theme {
    /// A chip on a row's meta line: due today (brand), and pinned, repeat
    /// and other due days (fill).
    enum Chip {
        static let height: CGFloat = 20
        static let paddingX: CGFloat = 7
    }

    /// The toast's action (Undo), an outline in the pill's ink.
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
