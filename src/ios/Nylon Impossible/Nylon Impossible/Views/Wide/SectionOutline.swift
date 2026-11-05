//
//  SectionOutline.swift
//  Nylon Impossible
//
//  The board's section with the keyboard (the sidebar, a column, the open
//  todo) shows a light 4pt outline inside its edges: `sectionOutline`, ink
//  at 8%, so it reads as a frame rather than a selection. It follows the
//  States rule "Keyboard or pointer": a key press turns it on, a pointer
//  press turns it off.
//

import SwiftUI

extension Theme.Wide {
    /// The section outline's width, drawn inside the section's edges.
    static let sectionOutline: CGFloat = 4
}

extension View {
    /// Outline this section while the keyboard is on (or in) it.
    func sectionOutline(_ isOn: Bool) -> some View {
        overlay {
            if isOn {
                Rectangle()
                    .strokeBorder(Theme.Colors.sectionOutline, lineWidth: Theme.Wide.sectionOutline)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
    }

    /// Run `action` on every pointer press in the window, before the view
    /// under the pointer sees it, so the keyboard's looks come off however
    /// the click lands. The Mac only; on iPad the board's taps say so
    /// themselves.
    func onPointerPress(_ action: @escaping () -> Void) -> some View {
        #if os(macOS)
        modifier(PointerPressMonitor(action: action))
        #else
        self
        #endif
    }
}

#if os(macOS)
import AppKit

private struct PointerPressMonitor: ViewModifier {
    let action: () -> Void
    @State private var monitor: Any?

    func body(content: Content) -> some View {
        content
            .onAppear {
                guard monitor == nil else { return }
                monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { event in
                    action()
                    return event
                }
            }
            .onDisappear {
                if let monitor { NSEvent.removeMonitor(monitor) }
                monitor = nil
            }
    }
}
#endif
