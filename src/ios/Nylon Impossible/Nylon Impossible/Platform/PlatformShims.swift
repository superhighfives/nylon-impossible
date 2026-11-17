//
//  PlatformShims.swift
//  Nylon Impossible
//
//  The few places the app touches UIKit or AppKit directly, behind one small
//  API each, so shared views and services never need `#if os(macOS)` for
//  them: a light haptic, whether VoiceOver or Switch Control is on, the
//  Liquid Glass composer, and the pointing-hand cursor over clickable chrome.
//
//  Compiled into the app and the share extension.
//

import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// The light tap the share extension plays when a todo lands. On a Mac it's
/// the trackpad's alignment haptic, which is silent on a mouse.
enum Haptics {
    @MainActor
    static func lightImpact() {
        #if os(macOS)
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
        #else
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
    }
}

/// Whether an assistive technology that moves focus one element at a time
/// is running — VoiceOver or Switch Control — so a toast stays up long enough
/// to reach.
enum AssistiveTechnology {
    @MainActor
    static var isRunning: Bool {
        #if os(macOS)
        let workspace = NSWorkspace.shared
        return workspace.isVoiceOverEnabled || workspace.isSwitchControlEnabled
        #else
        return UIAccessibility.isVoiceOverRunning || UIAccessibility.isSwitchControlRunning
        #endif
    }
}

extension PlatformFont {
    /// The font's default line height — `UIFont.lineHeight`, which `NSFont`
    /// doesn't have.
    var nylonLineHeight: CGFloat {
        #if os(macOS)
        return ceil(ascender - descender + leading)
        #else
        return lineHeight
        #endif
    }
}

extension View {
    /// Liquid Glass where the OS has it (always, on iOS 26), a regular
    /// material on an older Mac.
    @ViewBuilder
    func nylonGlass(cornerRadius: CGFloat) -> some View {
        #if os(macOS)
        if #available(macOS 26, *) {
            glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
        } else {
            background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
        #else
        glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
        #endif
    }

    /// An inline navigation title over the canvas. A Mac window has no
    /// navigation bar, so it's a no-op there.
    @ViewBuilder
    func inlineNavigationBar(background: Bool = true) -> some View {
        #if os(iOS)
        if background {
            navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(Theme.Colors.canvas, for: .navigationBar)
        } else {
            navigationBarTitleDisplayMode(.inline)
        }
        #else
        self
        #endif
    }

    /// No navigation bar at all (the account sheet's root).
    func hidesNavigationBar() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }

    /// A search field that's always showing: in the navigation bar's drawer
    /// on iOS, in the toolbar on a Mac.
    func alwaysSearchable(text: Binding<String>, prompt: String) -> some View {
        #if os(iOS)
        searchable(text: text, placement: .navigationBarDrawer(displayMode: .always), prompt: prompt)
        #else
        searchable(text: text, placement: .toolbar, prompt: prompt)
        #endif
    }

    /// Draw fields, menus and buttons the way the design does — no bezels —
    /// on a Mac, where SwiftUI's defaults are bordered text fields and pop-up
    /// buttons. iOS's defaults already match, so it's a no-op there.
    func unbezeledControls() -> some View {
        #if os(macOS)
        textFieldStyle(.plain)
            .menuStyle(.button)
            .menuIndicator(.hidden)
            .buttonStyle(.plain)
        #else
        self
        #endif
    }

    /// The pointing-hand cursor while the pointer is over this view, on a
    /// Mac. It's a no-op on iOS.
    func pointingHandCursor() -> some View {
        #if os(macOS)
        return modifier(PointingHandCursor())
        #else
        return self
        #endif
    }
}

#if os(macOS)
private struct PointingHandCursor: ViewModifier {
    @State private var isPushed = false

    func body(content: Content) -> some View {
        content
            .onHover { inside in
                if inside, !isPushed {
                    NSCursor.pointingHand.push()
                    isPushed = true
                } else if !inside, isPushed {
                    NSCursor.pop()
                    isPushed = false
                }
            }
            .onDisappear {
                if isPushed {
                    NSCursor.pop()
                    isPushed = false
                }
            }
    }
}
#endif
