import CoreGraphics
import Foundation
import Testing
@testable import Nylon_Impossible

/// A column laid out like the board's: rows 40pt tall, stacked from y = 100
/// (the composer's bottom), pinned first.
struct DropColumn {
    static let top: CGFloat = 100
    static let height: CGFloat = 40

    var items: [BoardDrop.Item]

    /// `pinned` rows first, then `unpinned`, with ascending positions per tier.
    init(pinned: Int = 0, unpinned: Int) {
        let keys = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]
        items = (0..<pinned).map { BoardDrop.Item(id: UUID(), pinned: true, position: keys[$0]) }
            + (0..<unpinned).map { BoardDrop.Item(id: UUID(), pinned: false, position: keys[$0]) }
    }

    var rows: [BoardDrop.Row] {
        items.enumerated().map { index, item in
            let top = Self.top + CGFloat(index) * Self.height
            return BoardDrop.Row(id: item.id, pinned: item.pinned, span: .init(top: top, bottom: top + Self.height))
        }
    }

    /// A pointer in the upper (or lower) half of row `index`.
    func upper(_ index: Int) -> CGFloat { Self.top + CGFloat(index) * Self.height + 10 }
    func lower(_ index: Int) -> CGFloat { Self.top + CGFloat(index) * Self.height + 30 }
    /// Below the last row, in the column's bottom padding.
    var belowLast: CGFloat { Self.top + CGFloat(items.count) * Self.height + 12 }

    /// Where `dragged` lands for a pointer at `y`, as the board drops it:
    /// the slot under the pointer, then the placement. Nil: no change.
    func drop(_ dragged: BoardDrop.Item, at y: CGFloat?) -> BoardDrop.Placement? {
        let isHere = items.contains { $0.id == dragged.id }
        let slot = y.flatMap { BoardDrop.slot(rows: rows, dragged: dragged.id, y: $0, rowsTop: Self.top) }
        guard let slot = slot ?? (isHere ? nil : Int.max) else { return nil }
        return BoardDrop.placement(items: items, dragged: dragged, slot: slot)
    }

    /// The order after the drop, as indices into `items` (-1: the dropped todo).
    func order(after dragged: BoardDrop.Item, at y: CGFloat?) -> [Int] {
        let ids = items.map(\.id)
        guard let placement = drop(dragged, at: y) else { return ids.indices.map { $0 } }
        var others = items.filter { $0.id != dragged.id }
        var moved = dragged
        moved.position = placement.position
        others.insert(moved, at: placement.index)
        // The new position must sort it into that slot.
        let sorted = others.sorted { a, b in
            if a.pinned != b.pinned { return a.pinned }
            return a.position < b.position
        }
        #expect(sorted.map(\.id) == others.map(\.id))
        return others.map { ids.firstIndex(of: $0.id) ?? -1 }
    }
}

private let foreign = BoardDrop.Item(id: UUID(), pinned: false, position: "a0")
private let foreignPinned = BoardDrop.Item(id: UUID(), pinned: true, position: "a0")

@Suite("Board drop: own column")
struct BoardDropOwnColumnTests {
    let column = DropColumn(unpinned: 4)

    @Test("Upper half of a row lands above it, lower half below it")
    func halves() {
        let first = column.items[0], last = column.items[3]
        // Last row onto the first row's upper half: first.
        #expect(column.order(after: last, at: column.upper(0)) == [3, 0, 1, 2])
        // …its lower half: second.
        #expect(column.order(after: last, at: column.lower(0)) == [0, 3, 1, 2])
        // First row onto a middle row's halves.
        #expect(column.order(after: first, at: column.upper(2)) == [1, 0, 2, 3])
        #expect(column.order(after: first, at: column.lower(2)) == [1, 2, 0, 3])
        // First row onto the last row's halves.
        #expect(column.order(after: first, at: column.upper(3)) == [1, 2, 0, 3])
        #expect(column.order(after: first, at: column.lower(3)) == [1, 2, 3, 0])
    }

    @Test("Below the last row puts it last")
    func belowLast() {
        #expect(column.order(after: column.items[1], at: column.belowLast) == [0, 2, 3, 1])
    }

    @Test("Already there: no change")
    func alreadyThere() {
        // Over its own row, either half.
        #expect(column.drop(column.items[2], at: column.upper(2)) == nil)
        #expect(column.drop(column.items[2], at: column.lower(2)) == nil)
        // The gap just above or below itself.
        #expect(column.drop(column.items[2], at: column.lower(1)) == nil)
        #expect(column.drop(column.items[2], at: column.upper(3)) == nil)
        // The last row below the last row.
        #expect(column.drop(column.items[3], at: column.belowLast) == nil)
        #expect(column.drop(column.items[3], at: column.lower(3)) == nil)
    }

    @Test("The header and composer leave it where it is")
    func header() {
        #expect(column.drop(column.items[0], at: DropColumn.top - 20) == nil)
        #expect(column.drop(column.items[0], at: nil) == nil)
    }
}

@Suite("Board drop: from another column")
struct BoardDropOtherColumnTests {
    let column = DropColumn(unpinned: 3)

    @Test("Upper and lower halves of the first, a middle and the last row")
    func halves() {
        #expect(column.order(after: foreign, at: column.upper(0)) == [-1, 0, 1, 2])
        #expect(column.order(after: foreign, at: column.lower(0)) == [0, -1, 1, 2])
        #expect(column.order(after: foreign, at: column.upper(1)) == [0, -1, 1, 2])
        #expect(column.order(after: foreign, at: column.lower(1)) == [0, 1, -1, 2])
        #expect(column.order(after: foreign, at: column.upper(2)) == [0, 1, -1, 2])
        #expect(column.order(after: foreign, at: column.lower(2)) == [0, 1, 2, -1])
    }

    @Test("Below the last row, or the header, puts it at the end")
    func end() {
        #expect(column.order(after: foreign, at: column.belowLast) == [0, 1, 2, -1])
        #expect(column.order(after: foreign, at: DropColumn.top - 20) == [0, 1, 2, -1])
        #expect(column.order(after: foreign, at: nil) == [0, 1, 2, -1])
    }

    @Test("An empty column takes it anywhere")
    func empty() {
        let empty = DropColumn(unpinned: 0)
        #expect(BoardDrop.slot(rows: [], dragged: foreign.id, y: 300, rowsTop: DropColumn.top) == 0)
        #expect(empty.drop(foreign, at: 300) != nil)
        #expect(empty.drop(foreign, at: nil) != nil)
        #expect(BoardDrop.lineY(rows: [], slot: 0, dragged: foreign.id, y: 300) == nil)
    }

    @Test("An empty column draws the line under the composer, not a fill")
    func emptyLine() {
        // Anywhere in the column, the header and composer included.
        for y in [DropColumn.top - 40, DropColumn.top, 300] as [CGFloat] {
            #expect(BoardDrop.line(rows: [], dragged: foreign.id, pinned: false, y: y, rowsTop: DropColumn.top) == DropColumn.top)
        }
    }
}

@Suite("Board drop: pinned tier")
struct BoardDropTierTests {
    /// Two pinned rows (0, 1), then three unpinned (2, 3, 4).
    let column = DropColumn(pinned: 2, unpinned: 3)

    @Test("A pinned todo below the last row lands last among the pinned")
    func pinnedBelowLast() {
        #expect(column.order(after: column.items[0], at: column.belowLast) == [1, 0, 2, 3, 4])
        #expect(column.order(after: foreignPinned, at: column.belowLast) == [0, 1, -1, 2, 3, 4])
    }

    @Test("A pinned todo over the unpinned rows clamps to the pinned")
    func pinnedOverUnpinned() {
        #expect(column.order(after: column.items[0], at: column.upper(3)) == [1, 0, 2, 3, 4])
        #expect(column.order(after: foreignPinned, at: column.lower(4)) == [0, 1, -1, 2, 3, 4])
        // Already last among the pinned.
        #expect(column.drop(column.items[1], at: column.upper(4)) == nil)
    }

    @Test("An unpinned todo over the pinned rows clamps after them")
    func unpinnedOverPinned() {
        #expect(column.order(after: column.items[4], at: column.upper(0)) == [0, 1, 4, 2, 3])
        #expect(column.order(after: foreign, at: column.upper(0)) == [0, 1, -1, 2, 3, 4])
        #expect(column.order(after: foreign, at: column.belowLast) == [0, 1, 2, 3, 4, -1])
    }

    @Test("Within the pinned, the halves still decide")
    func withinPinned() {
        #expect(column.order(after: column.items[1], at: column.upper(0)) == [1, 0, 2, 3, 4])
        #expect(column.order(after: foreignPinned, at: column.lower(0)) == [0, -1, 1, 2, 3, 4])
    }
}

@Suite("Board drop: the line")
struct BoardDropLineTests {
    let column = DropColumn(unpinned: 3)

    private func line(_ dragged: BoardDrop.Item, at y: CGFloat) -> CGFloat? {
        BoardDrop.line(rows: column.rows, dragged: dragged.id, pinned: dragged.pinned, y: y, rowsTop: DropColumn.top)
    }

    @Test("From another column: the gap the pointer's half points to")
    func foreignLine() {
        #expect(line(foreign, at: column.upper(0)) == 100)
        #expect(line(foreign, at: column.lower(0)) == 140)
        #expect(line(foreign, at: column.upper(2)) == 180)
        #expect(line(foreign, at: column.lower(2)) == 220)
        #expect(line(foreign, at: column.belowLast) == 220)
    }

    @Test("Own column: around the dragged row, the nearer edge")
    func ownLine() {
        let first = column.items[0], middle = column.items[1]
        #expect(line(first, at: column.lower(1)) == 180)
        #expect(line(first, at: column.belowLast) == 220)
        #expect(line(middle, at: column.upper(1)) == 140)
        #expect(line(middle, at: column.lower(1)) == 180)
        #expect(line(middle, at: column.upper(0)) == 100)
    }

    @Test("Over the header or the composer: at the end from another column, none from this one")
    func header() {
        #expect(line(foreign, at: DropColumn.top - 1) == 220)
        #expect(line(column.items[0], at: DropColumn.top - 1) == nil)
    }

    @Test("Over the header, a pinned todo's line ends the pinned rows")
    func headerPinned() {
        let tiers = DropColumn(pinned: 2, unpinned: 2)
        #expect(BoardDrop.line(
            rows: tiers.rows, dragged: foreignPinned.id, pinned: true, y: DropColumn.top - 1, rowsTop: DropColumn.top
        ) == 180)
    }

    @Test("Rows scrolled out of the lazy stack are placed by order")
    func unlaidOut() {
        var rows = column.rows
        rows[0].span = nil
        // Pointer over the second row's upper half: the first, unmeasured,
        // row is above it.
        #expect(BoardDrop.slot(rows: rows, dragged: foreign.id, y: column.upper(1), rowsTop: DropColumn.top) == 1)
        rows = column.rows
        rows[2].span = nil
        #expect(BoardDrop.slot(rows: rows, dragged: foreign.id, y: column.lower(1), rowsTop: DropColumn.top) == 2)
    }
}

@Suite("Board drop: positions")
struct BoardDropPositionTests {
    @Test("Out-of-order neighbours append after the one above")
    func outOfOrder() {
        let a = BoardDrop.Item(id: UUID(), pinned: false, position: "a5")
        let b = BoardDrop.Item(id: UUID(), pinned: false, position: "a5")
        let placement = BoardDrop.placement(items: [a, b], dragged: foreign, slot: 1)
        #expect(placement?.index == 1)
        #expect((placement?.position ?? "") > "a5")
    }

    @Test("A neighbour across the tier boundary is ignored")
    func acrossTiers() {
        // A pinned "a9" above an unpinned "a1": an unpinned todo dropped
        // between them only has to sort before "a1".
        let pinned = BoardDrop.Item(id: UUID(), pinned: true, position: "a9")
        let unpinned = BoardDrop.Item(id: UUID(), pinned: false, position: "a1")
        let placement = BoardDrop.placement(items: [pinned, unpinned], dragged: foreign, slot: 1)
        #expect(placement?.index == 1)
        #expect((placement?.position ?? "z") < "a1")
    }
}
