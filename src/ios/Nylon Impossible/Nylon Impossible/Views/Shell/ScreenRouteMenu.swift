//
//  ScreenRouteMenu.swift
//  Nylon Impossible
//
//  DEBUG only: the `menu` screenshot route opens the selected row's real
//  context menu. Nothing can long-press the simulator from a script and
//  SwiftUI has no API to open a context menu, so this finds the row's
//  UIContextMenuInteraction and asks it to present. It uses a private
//  selector, and it's compiled out of release builds.
//

#if DEBUG
import SwiftUI
import UIKit

@MainActor
enum ScreenRouteMenu {
    /// The selected row's centre, in screen points.
    static var target: CGPoint?

    static func present() {
        guard let point = target,
              let window = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.windows.first }).first else {
            print("[ScreenRouteMenu] No row (\(String(describing: target))) or window")
            return
        }
        var found: (UIView, UIContextMenuInteraction)?
        func walk(_ view: UIView) {
            let local = view.convert(point, from: window)
            guard view.bounds.contains(local) || view === window else { return }
            for case let interaction as UIContextMenuInteraction in view.interactions {
                found = (view, interaction)
            }
            view.subviews.forEach(walk)
        }
        walk(window)
        let selector = NSSelectorFromString("_presentMenuAtLocation:")
        guard let (view, interaction) = found, interaction.responds(to: selector) else {
            print("[ScreenRouteMenu] No context menu interaction at \(point)")
            return
        }
        typealias Present = @convention(c) (AnyObject, Selector, CGPoint) -> Void
        let present = unsafeBitCast(interaction.method(for: selector), to: Present.self)
        present(interaction, selector, view.convert(point, from: window))
    }
}

extension View {
    /// Report this row's centre for the `menu` route when it's selected.
    func screenRouteMenuTarget(_ isSelected: Bool) -> some View {
        onGeometryChange(for: CGRect?.self) { isSelected ? $0.frame(in: .global) : nil } action: { frame in
            guard let frame else { return }
            var center = CGPoint(x: frame.midX, y: frame.midY)
            // `-NylonLandscape` turns the whole app a quarter clockwise, and
            // the global frame is from before that turn.
            if ScreenRoute.drawsLandscape, let width = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.screen.bounds.width }).first {
                center = CGPoint(x: width - center.y, y: center.x)
            }
            ScreenRouteMenu.target = center
        }
    }
}
#endif
