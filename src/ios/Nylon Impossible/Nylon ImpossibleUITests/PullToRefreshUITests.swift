//
//  PullToRefreshUITests.swift
//  Nylon ImpossibleUITests
//
//  The iPhone list has no pull-to-refresh (#416): dragging it down while
//  adding a todo moves it, and no spinner turns up in the tab strip above
//  the keyboard, where the report saw it. Sync runs on foreground and from
//  pushes.
//

import XCTest

final class PullToRefreshUITests: NylonUITestCase {
    func testPullingTheListDownDoesNotRefresh() throws {
        if isPad { throw XCTSkip("The iPad board keeps its pull-to-refresh") }
        launch("today", dark: true)
        let first = row("Call Mum about Sunday lunch")
        waitFor(first)

        // The marker is for fix-shots, which trims its recording to start
        // here. Flushed, or a piped stdout holds it until the test ends.
        print("FIX-SHOTS-GESTURE")
        fflush(stdout)

        // Start adding a todo, as in the report: the tab strip moves above
        // the keyboard, and that's where the spinner showed.
        let field = app.textViews["New todo"].exists ? app.textViews["New todo"] : app.textFields["New todo"]
        waitFor(field)
        field.tap()

        // Then a slow pull down on the list, held past where a refresh would
        // trigger.
        let start = first.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(
            forDuration: 0.2,
            thenDragTo: start.withOffset(CGVector(dx: 0, dy: 250)),
            withVelocity: .slow,
            thenHoldForDuration: 1.5
        )

        XCTAssertFalse(app.activityIndicators.firstMatch.exists, "pulling the list down started a refresh")
    }
}
