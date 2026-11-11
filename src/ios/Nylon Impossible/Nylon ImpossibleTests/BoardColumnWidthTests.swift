import CoreGraphics
import Testing
@testable import Nylon_Impossible

/// The wide board's columns are a quarter of the board, from Apple's minimum
/// up to the shared maximum (#641).
@Suite("Board column width")
struct BoardColumnWidthTests {
    private let minimum = Theme.Wide.columnMinWidth

    @Test func narrowBoardKeepsTheMinimum() {
        // A narrow Mac window: a quarter would be 200, so the board scrolls.
        #expect(Theme.Wide.columnWidth(for: 800, minimum: minimum) == 240)
    }

    @Test func middleBoardIsAQuarter() {
        // A 13" iPad in landscape, past the sidebar.
        #expect(Theme.Wide.columnWidth(for: 1128, minimum: minimum) == 282)
    }

    @Test func wideBoardStopsAtTheMaximum() {
        #expect(Theme.Board.columnMaxWidth == 416)
        #expect(Theme.Wide.columnWidth(for: 1664, minimum: minimum) == 416)
        #expect(Theme.Wide.columnWidth(for: 3000, minimum: minimum) == 416)
    }

    @Test func accessibilitySizesKeepTheirMinimum() {
        let large = Theme.Wide.columnMinWidthLargeText
        #expect(Theme.Wide.columnWidth(for: 1128, minimum: large) == 380)
        #expect(Theme.Wide.columnWidth(for: 3000, minimum: large) == 416)
    }
}
