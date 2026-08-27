//
//  WidgetRefresh.swift
//  Nylon Impossible
//
//  A widget never goes looking for new data — it renders the timeline it was
//  last given until somebody tells WidgetKit to ask again. So every place that
//  writes todos to the shared store calls this: the app on backgrounding, a
//  sync that pulled remote changes, the share extension, the Siri intent, and
//  the widget's own toggle.
//

import WidgetKit

enum WidgetRefresh {
    /// Matches the `kind` the widget registers itself under. Shared with the
    /// widget target so a rename can't silently stop refreshes — reloading an
    /// unknown kind is a no-op, not an error.
    static let todayKind = "TodayWidget"

    static func reload() {
        WidgetCenter.shared.reloadTimelines(ofKind: todayKind)
    }
}
