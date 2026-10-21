//
//  QuickActionService.swift
//  Nylon Impossible
//
//  Home Screen quick actions — the menu you get by long-pressing the app
//  icon — and every other way in from outside: `nylon://` URLs, the widget's
//  "+" and the Control Center control. The quick action items are declared
//  statically under `UIApplicationShortcutItems` in
//  Nylon-Impossible-Info.plist. Each entry point turns into a `DeepLink` and
//  is parked here until the SwiftUI view that acts on it is ready.
//
//  Compiled into the widget extension too, for `OpenComposerIntent`; posting
//  there is harmless, as that intent opens the app and runs in its process.
//

import Foundation
import Observation
#if os(iOS)
import UIKit
#endif

/// A Home Screen quick action the app knows how to perform. The raw values
/// must match the `UIApplicationShortcutItemType` strings in the Info.plist —
/// an item declared there with no case here is simply ignored.
enum QuickAction: String {
    /// "New todo": open straight into the composer with the keyboard up. The
    /// type string predates the todo/task vocabulary and stays as it is — it's
    /// the item's identity, not its copy.
    case newTask = "com.superhighfives.Nylon-Impossible.new-task"

    #if os(iOS)
    init?(_ shortcutItem: UIApplicationShortcutItem) {
        self.init(rawValue: shortcutItem.type)
    }
    #endif

    /// The route this action takes — the same one `nylon://add?list=today`
    /// does, so the quick action, the widget and the control can't drift.
    var deepLink: DeepLink {
        switch self {
        case .newTask: return .add(list: .today)
        }
    }
}

/// Parks the route the app was opened with until a view is ready to follow
/// it.
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

    private(set) var pending: DeepLink?

    private init() {}

    func post(_ link: DeepLink) {
        pending = link
    }

    func post(_ action: QuickAction) {
        post(action.deepLink)
    }

    /// Returns the pending route and clears it, so returning to the app later
    /// doesn't replay one that's already been handled.
    func take() -> DeepLink? {
        defer { pending = nil }
        return pending
    }
}
