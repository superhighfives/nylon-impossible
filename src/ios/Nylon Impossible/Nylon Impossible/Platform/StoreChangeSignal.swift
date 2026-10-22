//
//  StoreChangeSignal.swift
//  Nylon Impossible
//
//  A cross-process "the shared store changed" ping. The widget's
//  tick-to-done and the share extension write the App Group store from
//  their own processes, where the app's `ModelContext.didSave` never fires;
//  they post this Darwin notification so a running Mac app can refresh its
//  Dock badge and sync. Posting is harmless where nothing listens (iOS, where
//  the app picks changes up on its next foreground).
//
//  Compiled into the app, the widget and the share extension.
//

import Foundation
import notify

enum StoreChangeSignal {
    static let name = "com.superhighfives.Nylon-Impossible.store-changed"

    static func post() {
        notify_post(name)
    }

    #if os(macOS)
    /// Run `handler` on the main queue whenever any process posts the signal.
    /// Lives for the app's lifetime; there's no unregister.
    @MainActor
    static func observe(_ handler: @escaping @MainActor () -> Void) {
        var token: Int32 = 0
        notify_register_dispatch(name, &token, .main) { _ in
            MainActor.assumeIsolated { handler() }
        }
    }
    #endif
}
