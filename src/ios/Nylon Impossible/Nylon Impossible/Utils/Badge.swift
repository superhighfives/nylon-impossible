//
//  Badge.swift
//  Nylon Impossible
//
//  App icon badge count: number of todos due today or overdue (`completed =
//  false` and `dueDate < startOfTomorrowLocal`). Recomputed after every sync
//  and on app foreground so it crosses the day boundary even without a sync.
//

import Foundation
import SwiftData
import UserNotifications

@MainActor
enum BadgeService {
    /// Compute the badge count from the local SwiftData store and apply it to
    /// the app icon. Silently no-ops on failure — badges are best-effort, not
    /// load-bearing for app function.
    static func refresh(modelContext: ModelContext) {
        let count = computeCount(modelContext: modelContext)
        // setBadgeCount replaces the iOS 17–deprecated
        // applicationIconBadgeNumber; it requires no user permission prompt
        // for the launcher badge specifically.
        UNUserNotificationCenter.current().setBadgeCount(count) { _ in }
    }

    static func computeCount(modelContext: ModelContext) -> Int {
        let cutoff = TodayDigest.startOfTomorrow()
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate { todo in
                !todo.isCompleted &&
                !todo.isDeleted &&
                todo.dueDate != nil &&
                todo.dueDate! < cutoff
            }
        )
        return (try? modelContext.fetchCount(descriptor)) ?? 0
    }
}
