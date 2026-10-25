//
//  PullToRefreshUITests.swift
//  Nylon ImpossibleUITests
//
//  The iPhone layout has no pull-to-refresh (#416). `.refreshable` reached
//  every scroll view under it, including the list-chip row above the
//  composer, so pulling that row down while adding a todo showed a spinner
//  there. Sync runs on foreground and from pushes.
//

import XCTest

final class PullToRefreshUITests: NylonUITestCase {
    func testPullingTheChipRowDownDoesNotRefresh() throws {
        if isPad { throw XCTSkip("The iPad board keeps its pull-to-refresh") }
        launch("today", dark: true)
        waitFor(row("Call Mum about Sunday lunch"))

        // Start adding a todo, as in the report: the list chips appear in a
        // row above the field, and the spinner showed in that row.
        let field = app.textViews["New todo"].exists ? app.textViews["New todo"] : app.textFields["New todo"]
        waitFor(field)
        field.tap()
        // The chip row shows once the field has focus. The keyboard is only
        // for the picture, and a fresh simulator can take a while to bring
        // it up the first time, so don't fail on it.
        _ = app.keyboards.firstMatch.waitForExistence(timeout: 15)

        // The marker is for fix-shots, which trims its recording to start
        // here. Flushed, or a piped stdout holds it until the test ends.
        print("FIX-SHOTS-GESTURE")
        fflush(stdout)

        // A slow pull down on the chip row (just above the field), held past
        // where a refresh would trigger.
        let chips = field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0)).withOffset(CGVector(dx: 0, dy: -24))
        chips.press(
            forDuration: 0.2,
            thenDragTo: chips.withOffset(CGVector(dx: 0, dy: 140)),
            withVelocity: .slow,
            thenHoldForDuration: 1.5
        )

        XCTAssertFalse(app.activityIndicators.firstMatch.exists, "pulling the chip row down started a refresh")
    }
}
