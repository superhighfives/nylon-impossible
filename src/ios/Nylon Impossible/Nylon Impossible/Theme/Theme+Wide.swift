//
//  Theme+Wide.swift
//  Nylon Impossible
//
//  The Mac popover's measurements and type roles, alongside Theme+Phone: the
//  wide scale (Body 15) the web board uses too. Like the phone roles they're
//  built on the generated `Theme.Fonts.Style`, so they scale with Dynamic Type.
//

import SwiftUI

extension Theme {
    /// Fixed measurements of the wide layout (the Mac popover).
    enum Wide {
        /// The rows' gutter.
        static let gutter = Theme.Space.s6
    }
}

extension Theme.Fonts.Role {
    /// A todo's title in a popover row.
    static let rowTitleWide = Theme.Fonts.Style(
        size: 15, lineHeight: 21, weight: .medium, variationWeight: 500, isDisplay: false, textStyle: .subheadline
    )
    /// Wide body: the popover's composer.
    static let bodyWide = Theme.Fonts.Wide.body
}

extension EnvironmentValues {
    /// True inside the Mac popover, where rows use the wide type scale, the
    /// wide gutter and a pointer hover tint.
    @Entry var isWideLayout = false
    /// True while the selection last moved by keyboard: the selected row adds
    /// a bar beside its fill. A click selects with the fill alone.
    @Entry var selectsByKeyboard = false
}
