//
//  ComposerFocusGuard.swift
//  Nylon Impossible
//
//  The overnight sweep (or any sync) moving rows off the page re-lays out
//  the list, which can resign the phone composer's keyboard mid-typing.
//  Focus that drops right after rows leave the page in view isn't the
//  user's doing, so the guard says to take it back.
//
//  Ticking a row done while typing counts too: the checkbox doesn't take
//  focus, so a drop straight after is the same relayout, and keeping the
//  keyboard is what the user expects. Swiping to another page doesn't: its
//  rows were never swept, they just stopped being in view.
//

import Foundation

struct ComposerFocusGuard {
    typealias Page = TodoViewModel.Page

    /// The rows in view, keyed by the page they're on.
    struct PageRows: Equatable {
        var page: Page
        var ids: [UUID]
    }

    /// How soon after rows leave a drop still counts as theirs.
    static let window: TimeInterval = 1

    private(set) var isFocused = false
    private var rowsLeftAt: Date?

    mutating func rowsChanged(from old: PageRows, to new: PageRows, at now: Date) {
        guard isFocused, old.page == new.page, !Set(old.ids).isSubset(of: new.ids) else { return }
        rowsLeftAt = now
    }

    /// Records the composer's focus. Returns true when it should be focused
    /// again, because rows leaving dropped it.
    mutating func focusChanged(_ focused: Bool, at now: Date) -> Bool {
        let droppedByRows = !focused && isFocused
            && rowsLeftAt.map { now.timeIntervalSince($0) < Self.window } == true
        isFocused = focused
        return droppedByRows
    }
}
