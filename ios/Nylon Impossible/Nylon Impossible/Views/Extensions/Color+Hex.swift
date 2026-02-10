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

// MARK: - App Colors
extension Color {
    // Primary gradient colors
    static let primaryBlue = Color(hex: "2B7FFF")
    static let primaryPurple = Color(hex: "AD46FF")
    
    // Text colors
    static let subtitleGray = Color(hex: "6A7282")
    static let placeholderGray = Color(hex: "99A1AF")
    static let tertiaryGray = Color(hex: "D1D5DC")
    static let inactiveTabText = Color(hex: "4A5565")
    
    // UI colors
    static let inputBorder = Color(hex: "E5E7EB")
    
    // Background gradient colors
    static let bgBlue = Color(hex: "EFF6FF")
    static let bgPurple = Color(hex: "FAF5FF")
    static let bgPink = Color(hex: "FDF2F8")
}

// MARK: - App Gradients
extension LinearGradient {
    static let primaryGradient = LinearGradient(
        colors: [.primaryBlue, .primaryPurple],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    static let backgroundGradient = LinearGradient(
        stops: [
            .init(color: .bgBlue, location: 0),
            .init(color: .bgPurple, location: 0.5),
            .init(color: .bgPink, location: 1)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    static let filterButtonGradient = LinearGradient(
        colors: [.primaryBlue, .primaryPurple],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}
