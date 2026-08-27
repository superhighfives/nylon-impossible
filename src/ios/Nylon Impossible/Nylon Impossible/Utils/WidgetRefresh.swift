//
//  WidgetRefresh.swift
//  Nylon Impossible
//
//  A widget never goes looking for new data — it renders the timeline it was
//  last given until somebody tells WidgetKit to ask again. So every place that
//  writes todos to the shared store calls this: the app on backgrounding (its
//  one refresh, covering both its own edits and anything a sync pulled down),
//  the share extension, the Siri intent, and the widget's own completion.
//

import Foundation
import WidgetKit

enum WidgetRefresh {
    /// Matches the `kind` the widget registers itself under. Shared with the
    /// widget target so a rename can't silently stop refreshes — reloading an
    /// unknown kind is a no-op, not an error.
    static let todayKind = "TodayWidget"

    static func reload() {
        guard !isRunningTests else { return }
        WidgetCenter.shared.reloadTimelines(ofKind: todayKind)
    }

    /// `WidgetCenter` is a client of a system daemon, and asking it to reload
    /// from inside a unit-test host means an XPC round trip for a widget no
    /// test can see. Nothing asserts on it, so the call is pure cost — and a
    /// system service that stalls takes the whole test process with it.
    private static var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
}
