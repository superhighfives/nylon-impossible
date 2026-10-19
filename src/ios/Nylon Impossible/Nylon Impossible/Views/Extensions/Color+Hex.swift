//
//  Color+Hex.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - App Semantic Colors
//
// The original iOS palette. Every value that has a design token now reads it
// from the generated Theme.swift (src/shared/design/tokens.json), so web and
// iOS share one source; the names stay so existing views keep compiling.
// Phase 3's rebuilt views use `Theme.Colors` directly and this extension goes
// away with them.
extension Color {
    static let appBrand = Theme.Colors.brand
    static let appBrandForeground = Theme.Colors.brandInk

    // No token on purpose: the spec keeps yellow to fills, never text on
    // white, so this light-mode yellow-11 (#9E6C00) for swipe tints and small
    // accent icons is retired in Phase 3 rather than tokenized.
    static let appAccent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#FFE629")) // yellow-9 / yellowdark-9
            : UIColor(Color(hex: "#9E6C00")) // yellow-11
    })

    static let appBase = Theme.Colors.canvas
    static let appElevated = Theme.Colors.surface
    static let appDefault = Theme.Colors.ink
    static let appStrong = Theme.Colors.inkMuted
    static let appSubtle = Theme.Colors.inkSubtle
    static let appInactive = Color(.quaternaryLabel)
    static let appLine = Theme.Colors.hairline
    static let appTint = Theme.Colors.fill
    static let appDanger = Theme.Colors.destructive
    // No green exists on web, so this stays the native system color.
    static let appSuccess = Color(.systemGreen)
}
