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
// Values are pulled straight from the web app's Radix gray/yellow/red scales
// (src/web/node_modules/tailwindcss-radix-colors, steps re-exported as
// bg-gray-*/text-gray-*/border-gray-* etc. in radix-utilities.css) so the two
// platforms render the same grays, hairlines, and brand yellow instead of
// iOS's native (cooler, blue-tinted) system palette. Neutral tokens use the
// same trait-closure pattern as appAccent below rather than `.label` /
// `.separator`, trading Increase Contrast / other system-appearance
// adaptations for exact cross-platform parity.
extension Color {
    // Brand — Radix yellow step 9 (identical in both the light and dark
    // scales), so it stays a flat color rather than a trait closure.
    static let appBrand = Color(hex: "#FFE629")
    // Ink for text/icons sitting on the solid brand yellow (Radix
    // text-accent-contrast = yellow step 12) — a warm dark brown, not a
    // neutral gray, so branded fills (checkbox check, send button) read the
    // same on iOS as they do on web.
    static let appBrandForeground = Color(hex: "#473B1F")

    // Accent — used for research/citation/AI-question markers. The brand
    // yellow reads well on dark surfaces but is too pale for text/icons on a
    // light background, so light mode falls back to Radix yellow step 11
    // (web's text-accent-muted) for contrast.
    static let appAccent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#FFE629")) // yellow-9 / yellowdark-9
            : UIColor(Color(hex: "#9E6C00")) // yellow-11
    })

    // Backgrounds — Radix gray steps 1 (app) and 2 (surface). Light mode's
    // app background stays pure white (web keeps gray-1's paper tint off the
    // body element itself — see styles.css); dark mode uses graydark-1.
    static let appBase = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#111111")) // graydark-1
            : UIColor(Color(hex: "#FFFFFF"))
    })
    static let appElevated = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#191919")) // graydark-2
            : UIColor(Color(hex: "#F9F9F9")) // gray-2
    })

    // Text — Radix gray steps 10 (placeholder), 11 (muted), 12 (primary).
    static let appDefault = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#EEEEEE")) // graydark-12
            : UIColor(Color(hex: "#202020")) // gray-12
    })
    static let appStrong = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#B4B4B4")) // graydark-11
            : UIColor(Color(hex: "#646464")) // gray-11
    })
    static let appSubtle = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#7B7B7B")) // graydark-10
            : UIColor(Color(hex: "#838383")) // gray-10
    })
    static let appInactive = Color(.quaternaryLabel)

    // UI — Radix gray step 6 (border-gray-subtle, the app's hairline) and
    // step 3 (bg-gray-base, a soft fill for icon chips/badges).
    static let appLine = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#3A3A3A")) // graydark-6
            : UIColor(Color(hex: "#D9D9D9")) // gray-6
    })
    static let appTint = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "#222222")) // graydark-3
            : UIColor(Color(hex: "#F0F0F0")) // gray-3
    })
    // Radix red step 9 — identical value in both scales, so it's flat too.
    static let appDanger = Color(hex: "#E5484D")
    // No red/green equivalent exists on web (styles.css only imports the
    // gray/yellow/red scales), so this stays the native system color.
    static let appSuccess = Color(.systemGreen)
}
