//
//  ScreenRouteMenu+macOS.swift
//  Nylon Impossible
//
//  DEBUG only: the `menu` screenshot route on the Mac opens the selected
//  row's real context menu, the way a right-click would. The iOS version
//  walks UIKit for the row's context-menu interaction; here a synthesised
//  right mouse-down sent to the window does the same job through AppKit's
//  own event path, with no private API.
//

#if DEBUG && os(macOS)
import AppKit
import SwiftUI

@MainActor
enum ScreenRouteMenu {
    /// The selected row's centre, in the window's top-left coordinates.
    static var target: CGPoint?

    static func present() {
        guard let point = target,
              let window = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil && !($0 is NSPanel) }),
              let content = window.contentView else {
            print("[ScreenRouteMenu] No row (\(String(describing: target))) or window")
            return
        }
        // SwiftUI's global space is the window's content, top-left origin;
        // AppKit's window coordinates are bottom-left.
        let location = NSPoint(x: point.x, y: content.bounds.height - point.y)
        for type in [NSEvent.EventType.rightMouseDown, .rightMouseUp] {
            guard let event = NSEvent.mouseEvent(
                with: type,
                location: location,
                modifierFlags: [],
                timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: window.windowNumber,
                context: nil,
                eventNumber: 0,
                clickCount: 1,
                pressure: 1
            ) else { continue }
            window.sendEvent(event)
        }
    }
}

extension View {
    /// Report this row's centre for the `menu` route when it's selected.
    func screenRouteMenuTarget(_ isSelected: Bool) -> some View {
        onGeometryChange(for: CGRect?.self) { isSelected ? $0.frame(in: .global) : nil } action: { frame in
            guard let frame else { return }
            ScreenRouteMenu.target = CGPoint(x: frame.midX, y: frame.midY)
        }
    }
}
#endif
