import SwiftUI
import Testing
@testable import Nylon_Impossible
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// The overnight pill is one line in any board column (#516): the full text
/// when it fits, "4 moved" when it doesn't.
@Suite("Overnight pill: one line")
@MainActor
struct OvernightPillTests {
    private let twoDigits = OvernightNote.line(movedToThisWeek: 12, movedToSomeday: 0)!
    private let bothLists = OvernightNote.line(movedToThisWeek: 2, movedToSomeday: 1)!

    private func pill(_ line: OvernightNote.Line) -> some View {
        OvernightPill(line: line, onSee: {}, onDismiss: {}).environment(\.isWideLayout, true)
    }

    private func size<V: View>(_ view: V, width: CGFloat) -> CGSize {
        let proposal = CGSize(width: width, height: .greatestFiniteMagnitude)
        #if os(macOS)
        return NSHostingController(rootView: view).sizeThatFits(in: proposal)
        #else
        return UIHostingController(rootView: view).sizeThatFits(in: proposal)
        #endif
    }

    /// The pill's room in a column of this width: the header's gutters
    /// come off both sides.
    private func room(_ column: CGFloat) -> CGFloat { column - 2 * Theme.Wide.gutter }

    /// A pill that's one line for sure.
    private var oneLine: CGFloat { size(pill(OvernightNote.line(movedToThisWeek: 0, movedToSomeday: 1)!), width: 400).height }

    @Test("A 240pt column shows one line for both texts")
    func narrowColumn() {
        #expect(size(pill(twoDigits), width: room(240)).height == oneLine)
        #expect(size(pill(bothLists), width: room(240)).height == oneLine)
    }

    @Test("A 400pt column shows one line for both texts")
    func wideColumn() {
        #expect(size(pill(twoDigits), width: room(400)).height == oneLine)
        #expect(size(pill(bothLists), width: room(400)).height == oneLine)
    }

    /// The pill's natural width is the full text's (`ViewThatFits` tries it
    /// first): wider than a 240pt column's room, so it gets the short form,
    /// and within a 400pt column's, so that gets the full text.
    @Test("The full text shows at 400pt and the short form at 240pt")
    func whichForm() {
        for line in [twoDigits, bothLists] {
            let natural = size(pill(line).fixedSize(), width: 1000).width
            #expect(natural > room(240), "\(line.text) fits a 240pt column in full, so it never needs the short form there")
            #expect(natural <= room(400), "\(line.text) doesn't fit a 400pt column in full")
        }
    }
}
