//
//  QuickActionService.swift
//  Nylon Impossible
//
//  Home Screen quick actions — the menu you get by long-pressing the app
//  icon. The items themselves are declared statically under
//  `UIApplicationShortcutItems` in Nylon-Impossible-Info.plist; this is the
//  bridge between the UIKit scene callbacks that deliver them
//  (`AppDelegate.swift`) and the SwiftUI view that acts on them.
//

import Foundation
import Observation
import UIKit

/// A Home Screen quick action the app knows how to perform. The raw values
/// must match the `UIApplicationShortcutItemType` strings in the Info.plist —
/// an item declared there with no case here is simply ignored.
enum QuickAction: String {
    /// Open straight into the add-task field with the keyboard up.
    case newTask = "com.superhighfives.Nylon-Impossible.new-task"

    init?(_ shortcutItem: UIApplicationShortcutItem) {
        self.init(rawValue: shortcutItem.type)
    }
}

/// Parks the quick action the app was launched with until a view is ready to
/// perform it.
///
/// An action routinely arrives before anything can act on it: on a cold launch
/// it lands in `scene(_:willConnectTo:options:)` before the first `body` runs,
/// and while signed out `ContentView` isn't on screen at all. So it's held
/// here and consumed once — see `take()` — rather than fired at a view that
/// may not exist yet.
@MainActor
@Observable
final class QuickActionService {
    static let shared = QuickActionService()

    private(set) var pending: QuickAction?

    private init() {}

    func post(_ action: QuickAction) {
        pending = action
    }

    /// Returns the pending action and clears it, so returning to the app later
    /// doesn't replay one that's already been handled.
    func take() -> QuickAction? {
        defer { pending = nil }
        return pending
    }
}
