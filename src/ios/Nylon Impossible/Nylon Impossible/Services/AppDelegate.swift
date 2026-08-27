//
//  AppDelegate.swift
//  Nylon Impossible
//
//  SwiftUI's `App` has no hook for Home Screen quick actions, so the app keeps
//  a minimal UIKit delegate pair purely to receive them. The app delegate
//  exists only to install `QuickActionSceneDelegate`, which is where the two
//  delivery paths — cold launch and resume — actually land.
//

import UIKit

@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        // An unnamed configuration, so iOS doesn't look for a matching entry in
        // the (generated) scene manifest. Only `delegateClass` is customised —
        // leaving `sceneClass` alone keeps SwiftUI in charge of the window, so
        // `WindowGroup` still supplies the content.
        let configuration = UISceneConfiguration(
            name: nil,
            sessionRole: connectingSceneSession.role
        )
        configuration.delegateClass = QuickActionSceneDelegate.self
        return configuration
    }
}

/// Receives quick actions and parks them on `QuickActionService` for the UI to
/// pick up. Deliberately does not create a window — SwiftUI owns that.
@MainActor
final class QuickActionSceneDelegate: UIResponder, UIWindowSceneDelegate {
    /// Cold launch: the action that started the app rides in on the scene's
    /// connection options.
    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let shortcutItem = connectionOptions.shortcutItem else { return }
        _ = post(shortcutItem)
    }

    /// The app was already running: the action arrives here instead.
    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(post(shortcutItem))
    }

    /// - Returns: whether the item was one the app recognises.
    private func post(_ shortcutItem: UIApplicationShortcutItem) -> Bool {
        guard let action = QuickAction(shortcutItem) else { return false }
        QuickActionService.shared.post(action)
        return true
    }
}
