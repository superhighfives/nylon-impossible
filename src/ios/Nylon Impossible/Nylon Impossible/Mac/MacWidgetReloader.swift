//
//  MacWidgetReloader.swift
//  Nylon Impossible
//
//  Reloads the desktop widget whenever the store saves (every edit, every
//  sync, the popover's ticks) or another process signals a change (the
//  widget's tick-to-done, the share extension), debounced. A Mac's widgets
//  are on screen while the app runs, so the iOS rule of refreshing only on
//  backgrounding doesn't fit.
//

#if os(macOS)
import Foundation
import SwiftData

@MainActor
final class MacWidgetReloader {
    private var observer: NSObjectProtocol?
    private var debounce: Task<Void, Never>?

    func start() {
        guard observer == nil else { return }
        observer = NotificationCenter.default.addObserver(forName: ModelContext.didSave, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.storeDidChange() }
        }
        StoreChangeSignal.observe { [weak self] in
            self?.storeDidChange()
        }
    }

    private func storeDidChange() {
        debounce?.cancel()
        debounce = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            WidgetRefresh.reload()
        }
    }
}
#endif
