//
//  PlatformShimTests.swift
//  Nylon ImpossibleTests
//
//  The platform shims: the App Group each platform uses, the device idiom,
//  the font line height, the keychain query, and — on macOS — that the
//  generated Theme resolves its colours from the window's appearance
//  (light, dark and Increase Contrast) and that Archivo is registered.
//

import Foundation
import SwiftUI
import Testing
@testable import Nylon_Impossible
#if os(macOS)
import AppKit
#endif

@Suite("Platform shims")
@MainActor
struct PlatformShimTests {
    @Test("The App Group is iOS-style on iOS and Team-prefixed on macOS")
    func appGroupIdentifier() {
        #if os(macOS)
        #expect(AppGroup.identifier == "TGHU37N6EX.com.superhighfives.Nylon-Impossible")
        #expect(AppGroup.identifier.hasPrefix(AppGroup.teamIdentifier + "."))
        #else
        #expect(AppGroup.identifier == "group.com.superhighfives.Nylon-Impossible")
        #endif
        // The background sync service reads the same suite as everything else.
        #expect(BackgroundSyncService.appGroupSuiteName == AppGroup.identifier)
    }

    @Test("The device idiom gets the board on iPad and Mac")
    func deviceIdiom() {
        #if os(macOS)
        #expect(DeviceIdiom.current == .mac)
        #endif
        #expect(DeviceIdiom.mac.supportsBoard)
        #expect(DeviceIdiom.pad.supportsBoard)
        #expect(!DeviceIdiom.phone.supportsBoard)
    }

    @Test("A font's line height is at least its size")
    func lineHeight() {
        let font = Theme.Fonts.Wide.body.baseFont
        #expect(font.nylonLineHeight >= font.pointSize)
        #expect(font.nylonLineHeight < font.pointSize * 2)
    }

    @Test("Haptics and assistive-technology checks are callable everywhere")
    func callable() {
        Haptics.lightImpact()
        _ = AssistiveTechnology.isRunning
    }

    #if os(macOS)
    @Test("The keychain uses the data protection keychain on macOS")
    func keychainQuery() {
        let query = KeychainHelper.baseQuery(key: "k")
        #expect(query[kSecUseDataProtectionKeychain as String] as? Bool == true)
        #expect(query[kSecAttrAccount as String] as? String == "k")
    }

    @Test("Archivo is registered from the app bundle on macOS")
    func archivoRegistered() {
        let font = Theme.Fonts.Role.masthead.baseFont
        #expect(font.familyName == Theme.Fonts.displayFontFamily)
        #expect(font.pointSize == 46)
    }

    /// The colour a token draws with under a given window appearance.
    private func hex(_ color: Color, _ appearance: NSAppearance.Name) throws -> UInt32 {
        try hex(NSColor(color), appearance)
    }

    private func hex(_ color: NSColor, _ appearance: NSAppearance.Name) throws -> UInt32 {
        let appearance = try #require(NSAppearance(named: appearance))
        var resolved: NSColor?
        appearance.performAsCurrentDrawingAppearance {
            resolved = color.usingColorSpace(.sRGB)
        }
        let rgb = try #require(resolved)
        let r = UInt32((rgb.redComponent * 255).rounded())
        let g = UInt32((rgb.greenComponent * 255).rounded())
        let b = UInt32((rgb.blueComponent * 255).rounded())
        return r << 16 | g << 8 | b
    }

    @Test("Theme colours follow light and dark on macOS")
    func themeAppearances() throws {
        #expect(try hex(Theme.Colors.ink, .aqua) == 0x202020)
        #expect(try hex(Theme.Colors.ink, .darkAqua) == 0xEEEEEE)
        #expect(try hex(Theme.Colors.canvas, .darkAqua) == 0x111111)
        // The brand fill doesn't change with appearance.
        #expect(try hex(Theme.Colors.brand, .darkAqua) == 0xFFE629)
    }

    /// Increase Contrast reaches a Mac window as a high-contrast variant of
    /// its appearance, which only the system can create — `NSAppearance(named:)`
    /// hands back plain Aqua for those names — so the choice itself is checked
    /// here, with the ink token's values.
    @Test("Increase Contrast picks the high-contrast variant")
    func themeHighContrast() {
        func ink(dark: Bool, high: Bool) -> UInt32 {
            Theme.Colors.hex(
                light: 0x202020, dark: 0xEEEEEE, lightHighContrast: 0x000000, darkHighContrast: 0xFFFFFF,
                isDark: dark, isHighContrast: high
            )
        }
        #expect(ink(dark: false, high: false) == 0x202020)
        #expect(ink(dark: true, high: false) == 0xEEEEEE)
        #expect(ink(dark: false, high: true) == 0x000000)
        #expect(ink(dark: true, high: true) == 0xFFFFFF)
        // A token without contrast variants keeps its plain light/dark pair.
        let canvas = Theme.Colors.hex(
            light: 0xFFFFFF, dark: 0x111111, lightHighContrast: nil, darkHighContrast: nil,
            isDark: true, isHighContrast: true
        )
        #expect(canvas == 0x111111)
    }
    #endif
}

@Suite("External drops")
struct ExternalDropTests {
    @Test("A dragged row's id is a todo, not text")
    func rowIdIsTodo() {
        let id = UUID()
        #expect(ExternalDrop.classify(id.uuidString) == .todo(id))
        #expect(ExternalDrop.classify("  \(id.uuidString)\n") == .todo(id))
    }

    @Test("Text from another app becomes composer input, lines and all")
    func textIsDrafts() {
        #expect(ExternalDrop.classify("Buy milk\nCall Mum friday") == .drafts("Buy milk\nCall Mum friday"))
        #expect(ExternalDrop.classify("   ") == nil)
    }

    @Test("Web links are input; file URLs aren't")
    func links() throws {
        let web = try #require(URL(string: "https://www.visitlisboa.com/tram-28"))
        #expect(ExternalDrop.classify(web) == .drafts("https://www.visitlisboa.com/tram-28"))
        #expect(ExternalDrop.classify(URL(fileURLWithPath: "/tmp/notes.txt")) == nil)
    }
}
