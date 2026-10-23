//
//  ScrollAxisLock.swift
//  Nylon Impossible
//
//  The pager scrolls sideways and each list scrolls up and down, so a diagonal
//  drag moved both at once (and could pull-to-refresh while changing page).
//  Whichever scroll view starts moving first owns the gesture; the other is
//  disabled until it settles.
//

import SwiftUI

@MainActor
@Observable
final class ScrollAxisLock {
    private(set) var owner: Axis?

    func claim(_ axis: Axis, active: Bool) {
        if active {
            if owner == nil { owner = axis }
        } else if owner == axis {
            owner = nil
        }
    }
}

extension EnvironmentValues {
    @Entry var scrollAxisLock = ScrollAxisLock()
}

private struct AxisLocked: ViewModifier {
    let axis: Axis
    /// Extra reason to disable scrolling, independent of the lock.
    let disabled: Bool
    @Environment(\.scrollAxisLock) private var lock

    func body(content: Content) -> some View {
        content
            .scrollDisabled(disabled || (lock.owner != nil && lock.owner != axis))
            .onScrollPhaseChange { _, phase in
                lock.claim(axis, active: phase != .idle)
            }
    }
}

extension View {
    /// Make this scroll view yield to the other axis while that one is moving.
    func scrollAxisLocked(_ axis: Axis, disabled: Bool = false) -> some View {
        modifier(AxisLocked(axis: axis, disabled: disabled))
    }
}
