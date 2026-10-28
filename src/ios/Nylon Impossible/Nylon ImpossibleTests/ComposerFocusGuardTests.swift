import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("Composer focus guard")
struct ComposerFocusGuardTests {
    private let a = UUID(), b = UUID()
    private let t0 = Date(timeIntervalSince1970: 1_000)

    private func focused() -> ComposerFocusGuard {
        var guarded = ComposerFocusGuard()
        _ = guarded.focusChanged(true, at: t0)
        return guarded
    }

    @Test("Takes focus back when it drops right after rows leave the page")
    func refocusesAfterSweep() {
        var guarded = focused()
        guarded.rowsChanged(from: .init(page: .today, ids: [a, b]), to: .init(page: .today, ids: [b]), at: t0)
        let refocus = guarded.focusChanged(false, at: t0.addingTimeInterval(0.3))
        #expect(refocus)
    }

    @Test("Lets a drop go once the window has passed")
    func letsLateDropGo() {
        var guarded = focused()
        guarded.rowsChanged(from: .init(page: .today, ids: [a, b]), to: .init(page: .today, ids: [b]), at: t0)
        let refocus = guarded.focusChanged(false, at: t0.addingTimeInterval(ComposerFocusGuard.window))
        #expect(!refocus)
    }

    @Test("Swiping to another page isn't rows leaving")
    func ignoresPageSwitch() {
        var guarded = focused()
        guarded.rowsChanged(from: .init(page: .today, ids: [a, b]), to: .init(page: .thisWeek, ids: []), at: t0)
        let refocus = guarded.focusChanged(false, at: t0.addingTimeInterval(0.3))
        #expect(!refocus)
    }

    @Test("Rows arriving don't count")
    func ignoresAdditions() {
        var guarded = focused()
        guarded.rowsChanged(from: .init(page: .today, ids: [a]), to: .init(page: .today, ids: [a, b]), at: t0)
        let refocus = guarded.focusChanged(false, at: t0.addingTimeInterval(0.3))
        #expect(!refocus)
    }

    @Test("Rows leaving while the composer is unfocused don't arm it")
    func ignoresWhenUnfocused() {
        var guarded = ComposerFocusGuard()
        guarded.rowsChanged(from: .init(page: .today, ids: [a, b]), to: .init(page: .today, ids: [b]), at: t0)
        _ = guarded.focusChanged(true, at: t0.addingTimeInterval(0.1))
        let refocus = guarded.focusChanged(false, at: t0.addingTimeInterval(0.3))
        #expect(!refocus)
    }
}
