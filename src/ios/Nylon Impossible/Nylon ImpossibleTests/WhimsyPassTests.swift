//
//  WhimsyPassTests.swift
//  Nylon ImpossibleTests
//
//  #694: a dragged todo's tilt (one angle per drag, within ±tiltMax) and
//  the landed row's swing, and which meta parts a row sets on a chip.
//

import Foundation
import Testing
@testable import Nylon_Impossible

/// A small seeded generator (SplitMix64), so a run's draws repeat.
private struct SeededGenerator: RandomNumberGenerator {
    var state: UInt64

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

@MainActor
@Suite("Drag tilt")
struct DragTiltTests {
    @Test("every tilt is within ±tiltMax, and both ways turn up")
    func withinRange() {
        var rng = SeededGenerator(state: 694)
        let draws = (0..<2_000).map { _ in DragTilt.pick(using: &rng) }
        #expect(draws.allSatisfy { abs($0) <= Theme.Motion.tiltMax })
        #expect(draws.contains { $0 > 0 })
        #expect(draws.contains { $0 < 0 })
        // Spread across the range, not bunched at one angle.
        #expect(Set(draws).count > 1_900)
    }

    @Test("the same seed picks the same angles")
    func seeded() {
        var first = SeededGenerator(state: 42)
        var second = SeededGenerator(state: 42)
        let one = (0..<10).map { _ in DragTilt.pick(using: &first) }
        let two = (0..<10).map { _ in DragTilt.pick(using: &second) }
        #expect(one == two)
    }

    @Test("the landed row swings the other way, by settleOvershoot")
    func settleSwing() {
        #expect(DragTilt.settleSwing(for: 1.2) == -Theme.Motion.settleOvershoot)
        #expect(DragTilt.settleSwing(for: -1.2) == Theme.Motion.settleOvershoot)
        #expect(DragTilt.settleSwing(for: Theme.Motion.tiltMax) == -Theme.Motion.settleOvershoot)
        #expect(DragTilt.settleSwing(for: Theme.Motion.settleMinTilt) == -Theme.Motion.settleOvershoot)
    }

    @Test("a tilt under settleMinTilt lands without a swing")
    func noSwingWhenNearlyLevel() {
        #expect(DragTilt.settleSwing(for: 0) == 0)
        #expect(DragTilt.settleSwing(for: 0.1) == 0)
        #expect(DragTilt.settleSwing(for: -0.24) == 0)
    }
}

@MainActor
@Suite("Drag session tilt", .serialized)
struct DragSessionTiltTests {
    @Test("a drag picks its tilt once and holds it")
    func pickedOnce() {
        defer { TodoDragSession.end() }
        var rng = SeededGenerator(state: 7)
        let todo = TodoItem(title: "Plan Lisbon trip", position: "a0")
        TodoDragSession.begin(todo, using: &rng)
        let tilt = TodoDragSession.current?.tilt
        #expect(tilt != nil)
        #expect(abs(tilt ?? .infinity) <= Theme.Motion.tiltMax)
        // Re-reading, and the preview drawing, never pick again.
        #expect(TodoDragSession.current?.tilt == tilt)
        #expect(TodoDragSession.tilt(for: todo.id) == tilt)
        #expect(TodoDragSession.tilt(for: todo.id) == tilt)
        #expect(TodoDragSession.current?.id == todo.id)
    }

    @Test("a preview drawn before the drag begins keeps its angle")
    func previewFirst() {
        defer { TodoDragSession.end() }
        var rng = SeededGenerator(state: 8)
        let todo = TodoItem(title: "Call Mum", position: "a0")
        let shown = TodoDragSession.tilt(for: todo.id)
        TodoDragSession.begin(todo, using: &rng)
        #expect(TodoDragSession.current?.tilt == shown)
    }

    @Test("ending the drag lets the tilt go")
    func endClears() {
        var rng = SeededGenerator(state: 9)
        let todo = TodoItem(title: "Water the plants", position: "a0")
        TodoDragSession.begin(todo, using: &rng)
        TodoDragSession.end()
        #expect(TodoDragSession.current == nil)
    }
}

@MainActor
@Suite("Meta chips")
struct MetaChipTests {
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.locale = Locale(identifier: "en_US_POSIX")
        return calendar
    }()
    private static let locale = Locale(identifier: "en_US_POSIX")
    /// Sunday, October 18 2026, midday UTC.
    private static let now = Date(timeIntervalSince1970: 1_792_324_800)

    private func due(_ offset: Int) -> MetaPart? {
        let todo = TodoItem(title: "Todo")
        todo.dueDate = DueLabel.inDays(offset, now: Self.now, calendar: Self.calendar)
        return TodoMeta.parts(for: todo, subtasks: [], now: Self.now, calendar: Self.calendar, locale: Self.locale).first
    }

    @Test("due today is the brand chip")
    func dueToday() {
        #expect(MetaPart.due("Today", overdue: false, today: true).chip == .brand)
    }

    @Test("other due days, pinned and repeat are fill chips")
    func fillChips() {
        #expect(MetaPart.due("Tomorrow", overdue: false).chip == .fill)
        #expect(MetaPart.due("Fri", overdue: false).chip == .fill)
        #expect(MetaPart.due("Oct 30", overdue: false).chip == .fill)
        #expect(MetaPart.pinned.chip == .fill)
        #expect(MetaPart.repeats("Weekly").chip == .fill)
    }

    @Test("overdue, subtasks, notes and links stay plain")
    func plain() {
        #expect(MetaPart.due("3 days overdue", overdue: true).chip == nil)
        #expect(MetaPart.subtasks(done: 1, total: 4).chip == nil)
        #expect(MetaPart.notes(words: 2).chip == nil)
        #expect(MetaPart.link("visitlisboa.com", more: 2).chip == nil)
    }

    @Test("TodoMeta marks only a todo due today as today")
    func partsMarkToday() {
        #expect(due(0) == .due("Today", overdue: false, today: true))
        #expect(due(1) == .due("Tomorrow", overdue: false, today: false))
        #expect(due(5) == .due("Fri", overdue: false, today: false))
        #expect(due(12) == .due("Oct 30", overdue: false, today: false))
        #expect(due(-1) == .due("1 day overdue", overdue: true, today: false))
        #expect(due(0)?.chip == .brand)
        #expect(due(1)?.chip == .fill)
        #expect(due(-1)?.chip == nil)
    }

    @Test("VoiceOver still hears due today as Due Today")
    func spoken() {
        #expect(TodoMeta.accessibilityText([.due("Today", overdue: false, today: true)]) == "Due Today")
    }
}
