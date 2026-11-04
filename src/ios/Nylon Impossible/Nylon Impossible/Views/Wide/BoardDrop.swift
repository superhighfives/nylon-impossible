//
//  BoardDrop.swift
//  Nylon Impossible
//
//  Where a todo dropped on a board column (iPad and Mac) lands: the gap
//  nearest the pointer. Over a row, its upper half means above it and its
//  lower half below it; the space under the last row is the end. The gap is
//  clamped into the dragged todo's tier (a column sorts pinned first, so a
//  pinned todo only lands among the pinned and an unpinned one only after
//  them), and its position is generated between its new neighbours in that
//  tier. Mirrors the web board's `src/web/src/lib/dragOrder.ts`.
//
//  Slots count the column's *other* rows: its rows without the dragged todo,
//  which keeps its space (faded) while it's dragged.
//

import CoreGraphics
import Foundation

enum BoardDrop {
    /// A row's vertical extent, in one coordinate space.
    struct Span: Equatable {
        var top: CGFloat
        var bottom: CGFloat

        var mid: CGFloat { (top + bottom) / 2 }
    }

    /// A row of the column, top to bottom. `span` is nil for a row that isn't
    /// laid out (scrolled well out of a lazy stack); it's taken to be above
    /// the laid-out rows if it comes before them and below them otherwise.
    struct Row: Equatable {
        var id: UUID
        var pinned: Bool
        var span: Span?
    }

    /// A row's place in the order.
    struct Item: Equatable {
        var id: UUID
        var pinned: Bool
        var position: String
    }

    /// Where a drop lands: the slot among the other rows, and the position
    /// that puts it there.
    struct Placement: Equatable {
        var index: Int
        var position: String
    }

    // MARK: - The gap under the pointer

    /// The slot (0…n) among the column's other rows that a pointer at `y`
    /// points to: before the first row whose middle is below it. Not yet
    /// clamped to a tier. Nil when the pointer is above `rowsTop`, over the
    /// header or the composer, where a drop is a drop on the column itself.
    static func slot(rows: [Row], dragged: UUID, y: CGFloat, rowsTop: CGFloat) -> Int? {
        guard y >= rowsTop else { return nil }
        let others = rows.filter { $0.id != dragged }
        let firstKnown = others.firstIndex { $0.span != nil }
        for (index, row) in others.enumerated() {
            let mid: CGFloat
            if let span = row.span {
                mid = span.mid
            } else if let firstKnown, index < firstKnown {
                mid = -.infinity
            } else {
                mid = .infinity
            }
            if y < mid { return index }
        }
        return others.count
    }

    /// Clamp a slot into a tier. `othersPinned` is the other rows' pinned
    /// flags, pinned first; a pinned todo lands among the pinned, an
    /// unpinned one after them.
    static func clampToTier(othersPinned: [Bool], pinned: Bool, index: Int) -> Int {
        let pinnedCount = othersPinned.filter { $0 }.count
        return pinned
            ? min(max(index, 0), pinnedCount)
            : min(max(index, pinnedCount), othersPinned.count)
    }

    /// The slot a pointer at `y` drops `dragged` into, clamped to its tier.
    /// Nil over the header or the composer.
    static func target(rows: [Row], dragged: UUID, pinned: Bool, y: CGFloat, rowsTop: CGFloat) -> Int? {
        guard let slot = slot(rows: rows, dragged: dragged, y: y, rowsTop: rowsTop) else { return nil }
        let others = rows.filter { $0.id != dragged }.map(\.pinned)
        return clampToTier(othersPinned: others, pinned: pinned, index: slot)
    }

    /// Where the drop line for (clamped) `slot` goes: the middle of the gap
    /// between the two rows a todo dropped there lands between. Above the
    /// first row for slot 0, below the last for the end slot. Nil when there
    /// are no rows, or the gap's rows aren't laid out.
    ///
    /// The dragged todo's own slot (in its own column) has two edges, above
    /// and below it; the line takes whichever is nearer the pointer at `y`.
    static func lineY(rows: [Row], slot: Int, dragged: UUID, y: CGFloat) -> CGFloat? {
        guard !rows.isEmpty else { return nil }
        let own = rows.firstIndex { $0.id == dragged }
        // The gap in `rows` the line marks: just before rows[gap].
        var gap = slot
        if let own {
            if slot > own {
                gap = slot + 1
            } else if slot == own, let span = rows[own].span {
                gap = y - span.top <= span.bottom - y ? own : own + 1
            }
        }
        let above = gap > 0 ? rows[gap - 1].span : nil
        let below = gap < rows.count ? rows[gap].span : nil
        switch (above, below) {
        case let (above?, below?): return (above.bottom + below.top) / 2
        case let (above?, nil) where gap == rows.count: return above.bottom
        case let (nil, below?) where gap == 0: return below.top
        default: return nil
        }
    }

    // MARK: - The new order

    /// Where `dragged`, dropped at `slot` of a column whose rows are `items`
    /// (pinned first, then by position), lands: the slot clamped into its
    /// tier, and a position between its new neighbours in that tier.
    /// `items` may include the todo itself (a reorder in its own column);
    /// it's taken out first, so `slot` counts the other rows. Nil when it's
    /// already there, so nothing changes.
    static func placement(items: [Item], dragged: Item, slot: Int) -> Placement? {
        let others = items.filter { $0.id != dragged.id }
        let index = clampToTier(othersPinned: others.map(\.pinned), pinned: dragged.pinned, index: slot)
        if let current = items.firstIndex(where: { $0.id == dragged.id }), current == index { return nil }
        let before = index > 0 ? others[index - 1] : nil
        let after = index < others.count ? others[index] : nil
        // Neighbours across the tier boundary are ignored: tiers sort apart.
        let prev = before?.pinned == dragged.pinned ? before?.position : nil
        let next = after?.pinned == dragged.pinned ? after?.position : nil
        // Duplicate or out-of-order neighbours (possible after concurrent
        // edits) would trap generateKeyBetween; append after `prev` instead.
        if let prev, let next, prev >= next {
            return Placement(index: index, position: generateKeyBetween(prev, nil))
        }
        return Placement(index: index, position: generateKeyBetween(prev, next))
    }
}
