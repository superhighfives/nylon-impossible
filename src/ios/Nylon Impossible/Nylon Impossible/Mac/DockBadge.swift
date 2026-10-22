//
//  DockBadge.swift
//  Nylon Impossible
//
//  The Dock icon's number: how many todos are open for today — the same
//  `TodayDigest` set the widget and the menu bar list (the Today list, plus
//  anything due before midnight wherever it sits). The iOS app icon badge
//  counts the narrower due-or-overdue set; on a Mac the Dock is where you
//  glance for the day's size, so it takes the widget's meaning.
//
//  Recomputed whenever the store saves (every edit, every sync, the menu bar's
//  ticks), when another process signals a change (the widget's tick-to-done,
//  the share extension), on activation and at midnight. The same save also
//  reloads the desktop widget, debounced: a Mac's widgets are on screen while
//  the app is open, so the iOS rule of refreshing only on backgrounding
//  doesn't fit.
//

#if os(macOS)
import AppKit
import Combine
import SwiftData

@MainActor
final class DockBadgeController {
    /// The badge text for a count: nothing at zero.
    static func label(for count: Int) -> String? {
        count > 0 ? "\(count)" : nil
    }

    /// Today's open count for the signed-in user; zero when signed out.
    static func count(userId: String?, context: ModelContext, now: Date = Date()) -> Int {
        guard let userId else { return 0 }
        return TodayDigest.fetch(userId: userId, context: context, now: now).count
    }

    /// Where the label goes — the Dock tile in the app, a recorder in tests.
    var apply: (String?) -> Void = { label in
        NSApp.dockTile.badgeLabel = label
    }

    private(set) var lastLabel: String?
    private var container: ModelContainer?
    private var settings: MacSettings?
    private var observers: [NSObjectProtocol] = []
    private var debounce: Task<Void, Never>?
    private var widgetDebounce: Task<Void, Never>?
    private var midnight: Task<Void, Never>?

    /// Who's signed in: shared defaults in the app, a fixed id in tests.
    var currentUserId: () -> String? = {
        AppGroup.defaults?.string(forKey: BackgroundSyncService.userIdKey)
    }

    /// Point the badge at a store and the Settings toggle, without observing
    /// anything yet. `start` does both.
    func attach(container: ModelContainer, settings: MacSettings) {
        self.container = container
        self.settings = settings
    }

    func start(container: ModelContainer, settings: MacSettings) {
        attach(container: container, settings: settings)
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: ModelContext.didSave, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.storeDidChange() }
        })
        observers.append(center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        })
        observers.append(center.addObserver(forName: .NSCalendarDayChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        })
        StoreChangeSignal.observe { [weak self] in
            self?.storeDidChange()
        }
        observeSettings()
        refresh()
    }

    /// Recompute now and push it to the Dock.
    func refresh(now: Date = Date()) {
        guard let container else { return }
        let enabled = settings?.showsDockBadge ?? true
        let userId = currentUserId()
        let label = enabled ? Self.label(for: Self.count(userId: userId, context: container.mainContext, now: now)) : nil
        lastLabel = label
        apply(label)
    }

    private func storeDidChange() {
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            self?.refresh()
        }
        widgetDebounce?.cancel()
        widgetDebounce = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            WidgetRefresh.reload()
        }
    }

    /// Follow the Settings toggle without polling.
    private func observeSettings() {
        withObservationTracking {
            _ = settings?.showsDockBadge
        } onChange: { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                self.refresh()
                self.observeSettings()
            }
        }
    }
}
#endif
