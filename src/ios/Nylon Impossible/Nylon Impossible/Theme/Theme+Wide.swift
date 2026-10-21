//
//  Theme+Wide.swift
//  Nylon Impossible
//
//  The iPad layout's measurements and type roles, alongside Theme+Phone. The
//  sizes follow the spec's wide scale (Display 40, Body 15, Meta 13) and the
//  wide prototype; like the phone roles they're built on the generated
//  `Theme.Fonts.Style`, so they scale with Dynamic Type.
//

import SwiftUI

extension Theme {
    /// Fixed measurements of the wide (iPad) layout.
    enum Wide {
        /// Column gutter.
        static let gutter = Theme.Space.s6
        /// The sidebar's width.
        static let sidebarWidth: CGFloat = 248
        /// The narrowest a column gets before the board scrolls sideways.
        static let columnMinWidth: CGFloat = 240
        /// The same at accessibility text sizes.
        static let columnMinWidthLargeText: CGFloat = 380
        /// Header height above each column's hairline, so every title sits
        /// on the same baseline. Scaled with Dynamic Type where it's used.
        static let columnHeader: CGFloat = 140
        /// The trailing panel (detail, Done, Settings).
        static let panelWidth: CGFloat = 400
        /// The sidebar's row height and corner radius. 44, the touch
        /// minimum: an iPad is still a touch screen without a pointer.
        static let sidebarRow: CGFloat = Theme.Space.rowMinHeight
        static let sidebarRadius: CGFloat = 8
    }
}

extension Theme.Fonts.Role {
    /// A column title ("This Week"), the wide display size.
    static let columnTitle = Theme.Fonts.Wide.display
    /// A todo's title in a column row.
    static let rowTitleWide = Theme.Fonts.Style(
        size: 15, lineHeight: 21, weight: .medium, variationWeight: 500, isDisplay: false, textStyle: .subheadline
    )
    /// Wide body: the column composer.
    static let bodyWide = Theme.Fonts.Wide.body
    /// The sidebar wordmark, Archivo 20 heavy.
    static let wordmark = Theme.Fonts.Style(
        size: 20, lineHeight: 24, weight: .heavy, variationWeight: 800, isDisplay: true, textStyle: .title3
    )
    /// A sidebar entry.
    static let sidebarItem = Theme.Fonts.Style(
        size: 15, lineHeight: 20, weight: .semibold, variationWeight: 600, isDisplay: false, textStyle: .subheadline
    )
}

extension EnvironmentValues {
    /// True inside the iPad board, where rows use the wide type scale, the
    /// column gutter and a pointer hover tint.
    @Entry var isWideLayout = false
}
