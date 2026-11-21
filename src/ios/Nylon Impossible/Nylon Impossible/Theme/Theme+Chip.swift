//
//  Theme+Chip.swift
//  Nylon Impossible
//
//  The measurements of due today's meta chip and the toast's Undo button.
//

import SwiftUI

extension Theme {
    /// Due today's chip on a row's meta line, the only one.
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
    static let metaChip = Theme.Fonts.Phone.metaChip
}
