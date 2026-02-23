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

// MARK: - Kumo Semantic Colors
extension Color {
    // Brand
    static let kumoBrand = Color(red: 0.145, green: 0.388, blue: 0.922) // ~#2563EB

    // Backgrounds
    static let kumoBase = Color(.systemBackground)
    static let kumoElevated = Color(.secondarySystemBackground)

    // Text
    static let kumoDefault = Color(.label)
    static let kumoStrong = Color(.secondaryLabel)
    static let kumoSubtle = Color(.tertiaryLabel)
    static let kumoInactive = Color(.quaternaryLabel)

    // UI
    static let kumoLine = Color(.separator)
    static let kumoTint = Color(.tertiarySystemFill)
    static let kumoDanger = Color(.systemRed)
    static let kumoSuccess = Color(.systemGreen)
}
